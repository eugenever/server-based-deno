// Copyright 2018-2023 the Deno authors. All rights reserved. MIT license.

use crate::util::fs::canonicalize_path;
use crate::util::path::specifier_parent;
use crate::util::path::specifier_to_file_path;

use crate::args::flags::Flags;
use deno_core::anyhow::anyhow;
use deno_core::anyhow::bail;
use deno_core::anyhow::Context;
use deno_core::error::AnyError;
use deno_core::serde::Deserialize;
use deno_core::serde::Serialize;
use deno_core::serde::Serializer;
use deno_core::serde_json;
use deno_core::serde_json::json;
use deno_core::serde_json::Value;
use deno_core::ModuleSpecifier;
use indexmap::IndexMap;
use std::collections::BTreeMap;
use std::collections::HashMap;
use std::collections::HashSet;
use std::fmt;
use std::path::Path;
use std::path::PathBuf;

pub type MaybeImportsResult = Result<Vec<deno_graph::ReferrerImports>, AnyError>;

#[derive(Hash)]
pub struct JsxImportSourceConfig {
    pub default_specifier: Option<String>,
    pub module: String,
}

/// The transpile options that are significant out of a user provided tsconfig
/// file, that we want to deserialize out of the final config for a transpile.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmitConfigOptions {
    pub check_js: bool,
    pub emit_decorator_metadata: bool,
    pub imports_not_used_as_values: String,
    pub inline_source_map: bool,
    pub inline_sources: bool,
    pub source_map: bool,
    pub jsx: String,
    pub jsx_factory: String,
    pub jsx_fragment_factory: String,
    pub jsx_import_source: Option<String>,
}

/// There are certain compiler options that can impact what modules are part of
/// a module graph, which need to be deserialized into a structure for analysis.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompilerOptions {
    pub jsx: Option<String>,
    pub jsx_import_source: Option<String>,
    pub types: Option<Vec<String>>,
}

/// A structure that represents a set of options that were ignored and the
/// path those options came from.
#[derive(Debug, Clone, Eq, PartialEq)]
pub struct IgnoredCompilerOptions {
    pub items: Vec<String>,
    pub maybe_specifier: Option<ModuleSpecifier>,
}

impl fmt::Display for IgnoredCompilerOptions {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let mut codes = self.items.clone();
        codes.sort_unstable();
        if let Some(specifier) = &self.maybe_specifier {
            write!(f, "Unsupported compiler options in \"{}\".\n  The following options were ignored:\n    {}", specifier, codes.join(", "))
        } else {
            write!(f, "Unsupported compiler options provided.\n  The following options were ignored:\n    {}", codes.join(", "))
        }
    }
}

impl Serialize for IgnoredCompilerOptions {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        Serialize::serialize(&self.items, serializer)
    }
}

/// A static slice of all the compiler options that should be ignored that
/// either have no effect on the compilation or would cause the emit to not work
/// in Deno.
pub const IGNORED_COMPILER_OPTIONS: &[&str] = &[
    "allowImportingTsExtensions",
    "allowSyntheticDefaultImports",
    "allowUmdGlobalAccess",
    "assumeChangesOnlyAffectDirectDependencies",
    "baseUrl",
    "build",
    "charset",
    "composite",
    "declaration",
    "declarationMap",
    "diagnostics",
    "disableSizeLimit",
    "downlevelIteration",
    "emitBOM",
    "emitDeclarationOnly",
    "esModuleInterop",
    "experimentalDecorators",
    "extendedDiagnostics",
    "forceConsistentCasingInFileNames",
    "generateCpuProfile",
    "help",
    "importHelpers",
    "incremental",
    "init",
    "inlineSourceMap",
    "inlineSources",
    "isolatedModules",
    "listEmittedFiles",
    "listFiles",
    "mapRoot",
    "maxNodeModuleJsDepth",
    "module",
    "moduleDetection",
    "moduleResolution",
    "newLine",
    "noEmit",
    "noEmitHelpers",
    "noEmitOnError",
    "noLib",
    "noResolve",
    "out",
    "outDir",
    "outFile",
    "paths",
    "preserveConstEnums",
    "preserveSymlinks",
    "preserveWatchOutput",
    "pretty",
    "project",
    "reactNamespace",
    "resolveJsonModule",
    "rootDir",
    "rootDirs",
    "showConfig",
    "skipDefaultLibCheck",
    "skipLibCheck",
    "sourceMap",
    "sourceRoot",
    "stripInternal",
    "target",
    "traceResolution",
    "tsBuildInfoFile",
    "typeRoots",
    "useDefineForClassFields",
    "version",
    "watch",
];

/// A function that works like JavaScript's `Object.assign()`.
pub fn json_merge(a: &mut Value, b: &Value) {
    match (a, b) {
        (&mut Value::Object(ref mut a), Value::Object(b)) => {
            for (k, v) in b {
                json_merge(a.entry(k.clone()).or_insert(Value::Null), v);
            }
        }
        (a, b) => {
            *a = b.clone();
        }
    }
}

fn parse_compiler_options(
    compiler_options: &HashMap<String, Value>,
    maybe_specifier: Option<ModuleSpecifier>,
) -> Result<(Value, Option<IgnoredCompilerOptions>), AnyError> {
    let mut filtered: HashMap<String, Value> = HashMap::new();
    let mut items: Vec<String> = Vec::new();

    for (key, value) in compiler_options.iter() {
        let key = key.as_str();
        // We don't pass "types" entries to typescript via the compiler
        // options and instead provide those to tsc as "roots". This is
        // because our "types" behavior is at odds with how TypeScript's
        // "types" works.
        if key != "types" {
            if IGNORED_COMPILER_OPTIONS.contains(&key) {
                items.push(key.to_string());
            } else {
                filtered.insert(key.to_string(), value.to_owned());
            }
        }
    }
    let value = serde_json::to_value(filtered)?;
    let maybe_ignored_options = if !items.is_empty() {
        Some(IgnoredCompilerOptions {
            items,
            maybe_specifier,
        })
    } else {
        None
    };

    Ok((value, maybe_ignored_options))
}

/// A structure for managing the configuration of TypeScript
#[derive(Debug, Clone)]
pub struct TsConfig(pub Value);

impl TsConfig {
    /// Create a new `TsConfig` with the base being the `value` supplied.
    pub fn new(value: Value) -> Self {
        TsConfig(value)
    }

    pub fn as_bytes(&self) -> Vec<u8> {
        let map = self.0.as_object().expect("invalid tsconfig");
        let ordered: BTreeMap<_, _> = map.iter().collect();
        let value = json!(ordered);
        value.to_string().as_bytes().to_owned()
    }

    /// Return the value of the `checkJs` compiler option, defaulting to `false`
    /// if not present.
    pub fn get_check_js(&self) -> bool {
        if let Some(check_js) = self.0.get("checkJs") {
            check_js.as_bool().unwrap_or(false)
        } else {
            false
        }
    }

    pub fn get_declaration(&self) -> bool {
        if let Some(declaration) = self.0.get("declaration") {
            declaration.as_bool().unwrap_or(false)
        } else {
            false
        }
    }

    /// Merge a serde_json value into the configuration.
    pub fn merge(&mut self, value: &Value) {
        json_merge(&mut self.0, value);
    }

    /// Take an optional user provided config file
    /// which was passed in via the `--config` flag and merge `compilerOptions` with
    /// the configuration.  Returning the result which optionally contains any
    /// compiler options that were ignored.
    pub fn merge_tsconfig_from_config_file(
        &mut self,
        maybe_config_file: Option<&ConfigFile>,
    ) -> Result<Option<IgnoredCompilerOptions>, AnyError> {
        if let Some(config_file) = maybe_config_file {
            let (value, maybe_ignored_options) = config_file.to_compiler_options()?;
            self.merge(&value);
            Ok(maybe_ignored_options)
        } else {
            Ok(None)
        }
    }
}

impl Serialize for TsConfig {
    /// Serializes inner hash map which is ordered by the key
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        Serialize::serialize(&self.0, serializer)
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct LintRulesConfig {
    pub tags: Option<Vec<String>>,
    pub include: Option<Vec<String>>,
    pub exclude: Option<Vec<String>>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct SerializedFilesConfig {
    pub include: Vec<String>,
    pub exclude: Vec<String>,
}

impl SerializedFilesConfig {
    pub fn into_resolved(
        self,
        config_file_specifier: &ModuleSpecifier,
    ) -> Result<FilesConfig, AnyError> {
        let config_dir = specifier_parent(config_file_specifier);
        Ok(FilesConfig {
            include: self
                .include
                .into_iter()
                .map(|p| {
                    let url = config_dir.join(&p)?;
                    specifier_to_file_path(&url)
                })
                .collect::<Result<Vec<_>, _>>()?,
            exclude: self
                .exclude
                .into_iter()
                .map(|p| {
                    let url = config_dir.join(&p)?;
                    specifier_to_file_path(&url)
                })
                .collect::<Result<Vec<_>, _>>()?,
        })
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FilesConfig {
    pub include: Vec<PathBuf>,
    pub exclude: Vec<PathBuf>,
}

impl FilesConfig {
    /// Gets if the provided specifier is allowed based on the includes
    /// and excludes in the configuration file.
    pub fn matches_specifier(&self, specifier: &ModuleSpecifier) -> bool {
        let file_path = match specifier_to_file_path(specifier) {
            Ok(file_path) => file_path,
            Err(_) => return false,
        };
        // Skip files which is in the exclude list.
        if self.exclude.iter().any(|i| file_path.starts_with(i)) {
            return false;
        }

        // Ignore files not in the include list if it's not empty.
        self.include.is_empty() || self.include.iter().any(|i| file_path.starts_with(i))
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct SerializedLintConfig {
    pub rules: LintRulesConfig,
    pub files: SerializedFilesConfig,
    pub report: Option<String>,
}

impl SerializedLintConfig {
    pub fn into_resolved(
        self,
        config_file_specifier: &ModuleSpecifier,
    ) -> Result<LintConfig, AnyError> {
        Ok(LintConfig {
            rules: self.rules,
            files: self.files.into_resolved(config_file_specifier)?,
            report: self.report,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub struct LintConfig {
    pub rules: LintRulesConfig,
    pub files: FilesConfig,
    pub report: Option<String>,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub enum ProseWrap {
    Always,
    Never,
    Preserve,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields, rename_all = "camelCase")]
pub struct FmtOptionsConfig {
    pub use_tabs: Option<bool>,
    pub line_width: Option<u32>,
    pub indent_width: Option<u8>,
    pub single_quote: Option<bool>,
    pub prose_wrap: Option<ProseWrap>,
    pub semi_colons: Option<bool>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct SerializedFmtConfig {
    pub options: FmtOptionsConfig,
    pub files: SerializedFilesConfig,
}

impl SerializedFmtConfig {
    pub fn into_resolved(
        self,
        config_file_specifier: &ModuleSpecifier,
    ) -> Result<FmtConfig, AnyError> {
        Ok(FmtConfig {
            options: self.options,
            files: self.files.into_resolved(config_file_specifier)?,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub struct FmtConfig {
    pub options: FmtOptionsConfig,
    pub files: FilesConfig,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct SerializedTestConfig {
    pub files: SerializedFilesConfig,
}

impl SerializedTestConfig {
    pub fn into_resolved(
        self,
        config_file_specifier: &ModuleSpecifier,
    ) -> Result<TestConfig, AnyError> {
        Ok(TestConfig {
            files: self.files.into_resolved(config_file_specifier)?,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub struct TestConfig {
    pub files: FilesConfig,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(default, deny_unknown_fields)]
struct SerializedBenchConfig {
    pub files: SerializedFilesConfig,
}

impl SerializedBenchConfig {
    pub fn into_resolved(
        self,
        config_file_specifier: &ModuleSpecifier,
    ) -> Result<BenchConfig, AnyError> {
        Ok(BenchConfig {
            files: self.files.into_resolved(config_file_specifier)?,
        })
    }
}

#[derive(Clone, Debug, Default)]
pub struct BenchConfig {
    pub files: FilesConfig,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum LockConfig {
    Bool(bool),
    PathBuf(PathBuf),
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigFileJson {
    pub compiler_options: Option<Value>,
    pub import_map: Option<String>,
    pub imports: Option<Value>,
    pub scopes: Option<Value>,
    pub lint: Option<Value>,
    pub fmt: Option<Value>,
    pub tasks: Option<Value>,
    pub test: Option<Value>,
    pub bench: Option<Value>,
    pub lock: Option<Value>,
}

#[derive(Clone, Debug)]
pub struct ConfigFile {
    pub specifier: ModuleSpecifier,
    pub json: ConfigFileJson,
}

impl ConfigFile {
    pub fn discover(_flags: &Flags, _cwd: &Path) -> Result<Option<ConfigFile>, AnyError> {
        Ok(None)
    }

    pub fn discover_from(
        _start: &Path,
        _checked: &mut HashSet<PathBuf>,
    ) -> Result<Option<ConfigFile>, AnyError> {
        // No config file found.
        Ok(None)
    }

    pub fn read(config_path: &Path) -> Result<Self, AnyError> {
        debug_assert!(config_path.is_absolute());

        // perf: Check if the config file exists before canonicalizing path.
        if !config_path.exists() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "Could not find the config file: {}",
                    config_path.to_string_lossy()
                ),
            )
            .into());
        }

        let config_path = canonicalize_path(config_path).map_err(|_| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!(
                    "Could not find the config file: {}",
                    config_path.to_string_lossy()
                ),
            )
        })?;
        let config_specifier = ModuleSpecifier::from_file_path(&config_path).map_err(|_| {
            anyhow!(
                "Could not convert path to specifier. Path: {}",
                config_path.display()
            )
        })?;
        Self::from_specifier(&config_specifier)
    }

    pub fn from_specifier(specifier: &ModuleSpecifier) -> Result<Self, AnyError> {
        let config_path = specifier_to_file_path(specifier)?;
        let config_text = match std::fs::read_to_string(config_path) {
            Ok(text) => text,
            Err(err) => bail!(
                "Error reading config file {}: {}",
                specifier,
                err.to_string()
            ),
        };
        Self::new(&config_text, specifier)
    }

    pub fn new(text: &str, specifier: &ModuleSpecifier) -> Result<Self, AnyError> {
        let jsonc = match jsonc_parser::parse_to_serde_value(text, &Default::default()) {
            Ok(None) => json!({}),
            Ok(Some(value)) if value.is_object() => value,
            Ok(Some(_)) => {
                return Err(anyhow!(
                    "config file JSON {} should be an object",
                    specifier,
                ))
            }
            Err(e) => {
                return Err(anyhow!(
                    "Unable to parse config file JSON {} because of {}",
                    specifier,
                    e.to_string()
                ))
            }
        };
        let json: ConfigFileJson = serde_json::from_value(jsonc)?;

        Ok(Self {
            specifier: specifier.to_owned(),
            json,
        })
    }

    /// Returns true if the configuration indicates that JavaScript should be
    /// type checked, otherwise false.
    pub fn get_check_js(&self) -> bool {
        self.json
            .compiler_options
            .as_ref()
            .and_then(|co| co.get("checkJs").and_then(|v| v.as_bool()))
            .unwrap_or(false)
    }

    /// Parse `compilerOptions` and return a serde `Value`.
    /// The result also contains any options that were ignored.
    pub fn to_compiler_options(&self) -> Result<(Value, Option<IgnoredCompilerOptions>), AnyError> {
        if let Some(compiler_options) = self.json.compiler_options.clone() {
            let options: HashMap<String, Value> = serde_json::from_value(compiler_options)
                .context("compilerOptions should be an object")?;
            parse_compiler_options(&options, Some(self.specifier.to_owned()))
        } else {
            Ok((json!({}), None))
        }
    }

    pub fn to_import_map_path(&self) -> Option<String> {
        self.json.import_map.clone()
    }

    pub fn to_import_map_value(&self) -> Value {
        let mut value = serde_json::Map::with_capacity(2);
        if let Some(imports) = &self.json.imports {
            value.insert("imports".to_string(), imports.clone());
        }
        if let Some(scopes) = &self.json.scopes {
            value.insert("scopes".to_string(), scopes.clone());
        }
        value.into()
    }

    pub fn is_an_import_map(&self) -> bool {
        self.json.imports.is_some() || self.json.scopes.is_some()
    }

    pub fn to_fmt_config(&self) -> Result<Option<FmtConfig>, AnyError> {
        if let Some(config) = self.json.fmt.clone() {
            let fmt_config: SerializedFmtConfig =
                serde_json::from_value(config).context("Failed to parse \"fmt\" configuration")?;
            Ok(Some(fmt_config.into_resolved(&self.specifier)?))
        } else {
            Ok(None)
        }
    }

    pub fn to_lint_config(&self) -> Result<Option<LintConfig>, AnyError> {
        if let Some(config) = self.json.lint.clone() {
            let lint_config: SerializedLintConfig =
                serde_json::from_value(config).context("Failed to parse \"lint\" configuration")?;
            Ok(Some(lint_config.into_resolved(&self.specifier)?))
        } else {
            Ok(None)
        }
    }

    pub fn to_test_config(&self) -> Result<Option<TestConfig>, AnyError> {
        if let Some(config) = self.json.test.clone() {
            let test_config: SerializedTestConfig =
                serde_json::from_value(config).context("Failed to parse \"test\" configuration")?;
            Ok(Some(test_config.into_resolved(&self.specifier)?))
        } else {
            Ok(None)
        }
    }

    pub fn to_bench_config(&self) -> Result<Option<BenchConfig>, AnyError> {
        if let Some(config) = self.json.bench.clone() {
            let bench_config: SerializedBenchConfig = serde_json::from_value(config)
                .context("Failed to parse \"bench\" configuration")?;
            Ok(Some(bench_config.into_resolved(&self.specifier)?))
        } else {
            Ok(None)
        }
    }

    /// Return any tasks that are defined in the configuration file as a sequence
    /// of JSON objects providing the name of the task and the arguments of the
    /// task in a detail field.
    pub fn to_lsp_tasks(&self) -> Option<Value> {
        let value = self.json.tasks.clone()?;
        let tasks: BTreeMap<String, String> = serde_json::from_value(value).ok()?;
        Some(
            tasks
                .into_iter()
                .map(|(key, value)| {
                    json!({
                      "name": key,
                      "detail": value,
                    })
                })
                .collect(),
        )
    }

    pub fn to_tasks_config(&self) -> Result<Option<IndexMap<String, String>>, AnyError> {
        if let Some(config) = self.json.tasks.clone() {
            let tasks_config: IndexMap<String, String> = serde_json::from_value(config)
                .context("Failed to parse \"tasks\" configuration")?;
            Ok(Some(tasks_config))
        } else {
            Ok(None)
        }
    }

    /// If the configuration file contains "extra" modules (like TypeScript
    /// `"types"`) options, return them as imports to be added to a module graph.
    pub fn to_maybe_imports(&self) -> MaybeImportsResult {
        let mut imports = Vec::new();
        let compiler_options_value = if let Some(value) = self.json.compiler_options.as_ref() {
            value
        } else {
            return Ok(Vec::new());
        };
        let compiler_options: CompilerOptions =
            serde_json::from_value(compiler_options_value.clone())?;
        if let Some(types) = compiler_options.types {
            imports.extend(types);
        }
        if !imports.is_empty() {
            let referrer = self.specifier.clone();
            Ok(vec![deno_graph::ReferrerImports { referrer, imports }])
        } else {
            Ok(Vec::new())
        }
    }

    /// Based on the compiler options in the configuration file, return the
    /// JSX import source configuration.
    pub fn to_maybe_jsx_import_source_config(&self) -> Option<JsxImportSourceConfig> {
        let compiler_options_value = self.json.compiler_options.as_ref()?;
        let compiler_options: CompilerOptions =
            serde_json::from_value(compiler_options_value.clone()).ok()?;
        let module = match compiler_options.jsx.as_deref() {
            Some("react-jsx") => Some("jsx-runtime".to_string()),
            Some("react-jsxdev") => Some("jsx-dev-runtime".to_string()),
            _ => None,
        };
        module.map(|module| JsxImportSourceConfig {
            default_specifier: compiler_options.jsx_import_source,
            module,
        })
    }

    pub fn resolve_tasks_config(&self) -> Result<IndexMap<String, String>, AnyError> {
        let maybe_tasks_config = self.to_tasks_config()?;
        let tasks_config = maybe_tasks_config.unwrap_or_default();
        for key in tasks_config.keys() {
            if key.is_empty() {
                bail!("Configuration file task names cannot be empty");
            } else if !key
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | ':'))
            {
                bail!("Configuration file task names must only contain alpha-numeric characters, colons (:), underscores (_), or dashes (-). Task: {}", key);
            } else if !key.chars().next().unwrap().is_ascii_alphabetic() {
                bail!("Configuration file task names must start with an alphabetic character. Task: {}", key);
            }
        }
        Ok(tasks_config)
    }

    pub fn to_lock_config(&self) -> Result<Option<LockConfig>, AnyError> {
        if let Some(config) = self.json.lock.clone() {
            let lock_config: LockConfig =
                serde_json::from_value(config).context("Failed to parse \"lock\" configuration")?;
            Ok(Some(lock_config))
        } else {
            Ok(None)
        }
    }
}

/// Represents the "default" type library that should be used when type
/// checking the code in the module graph.  Note that a user provided config
/// of `"lib"` would override this value.
#[derive(Debug, Clone, Copy, Eq, Hash, PartialEq)]
pub enum TsTypeLib {
    DenoWindow,
    DenoWorker,
    UnstableDenoWindow,
    UnstableDenoWorker,
}

impl Default for TsTypeLib {
    fn default() -> Self {
        Self::DenoWindow
    }
}

impl Serialize for TsTypeLib {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let value = match self {
            Self::DenoWindow => vec!["deno.window".to_string()],
            Self::DenoWorker => vec!["deno.worker".to_string()],
            Self::UnstableDenoWindow => {
                vec!["deno.window".to_string(), "deno.unstable".to_string()]
            }
            Self::UnstableDenoWorker => {
                vec!["deno.worker".to_string(), "deno.unstable".to_string()]
            }
        };
        Serialize::serialize(&value, serializer)
    }
}

/// An enum that represents the base tsc configuration to return.
pub enum TsConfigType {
    /// Return a configuration for bundling, using swc to emit the bundle. This is
    /// independent of type checking.
    Bundle,
    /// Return a configuration to use tsc to type check. This
    /// is independent of either bundling or emitting via swc.
    Check { lib: TsTypeLib },
    /// Return a configuration to use swc to emit single module files.
    Emit,
}

pub struct TsConfigForEmit {
    pub ts_config: TsConfig,
    pub maybe_ignored_options: Option<IgnoredCompilerOptions>,
}

/// For a given configuration type and optionally a configuration file,
/// return a `TsConfig` struct and optionally any user configuration
/// options that were ignored.
pub fn get_ts_config_for_emit(
    config_type: TsConfigType,
    maybe_config_file: Option<&ConfigFile>,
) -> Result<TsConfigForEmit, AnyError> {
    let mut ts_config = match config_type {
        TsConfigType::Bundle => TsConfig::new(json!({
          "allowImportingTsExtensions": true,
          "checkJs": false,
          "emitDecoratorMetadata": false,
          "importsNotUsedAsValues": "remove",
          "inlineSourceMap": false,
          "inlineSources": false,
          "sourceMap": false,
          "jsx": "react",
          "jsxFactory": "React.createElement",
          "jsxFragmentFactory": "React.Fragment",
        })),
        TsConfigType::Check { lib } => TsConfig::new(json!({
          "allowJs": true,
          "allowImportingTsExtensions": true,
          "allowSyntheticDefaultImports": true,
          "checkJs": false,
          "emitDecoratorMetadata": false,
          "experimentalDecorators": true,
          "incremental": true,
          "jsx": "react",
          "importsNotUsedAsValues": "remove",
          "inlineSourceMap": true,
          "inlineSources": true,
          "isolatedModules": true,
          "lib": lib,
          "module": "esnext",
          "moduleDetection": "force",
          "noEmit": true,
          "resolveJsonModule": true,
          "sourceMap": false,
          "strict": true,
          "target": "esnext",
          "tsBuildInfoFile": "internal:///.tsbuildinfo",
          "useDefineForClassFields": true,
          // TODO(@kitsonk) remove for Deno 2.0
          "useUnknownInCatchVariables": false,
        })),
        TsConfigType::Emit => TsConfig::new(json!({
          "allowImportingTsExtensions": true,
          "checkJs": false,
          "emitDecoratorMetadata": false,
          "importsNotUsedAsValues": "remove",
          "inlineSourceMap": true,
          "inlineSources": true,
          "sourceMap": false,
          "jsx": "react",
          "jsxFactory": "React.createElement",
          "jsxFragmentFactory": "React.Fragment",
          "resolveJsonModule": true,
        })),
    };
    let maybe_ignored_options = ts_config.merge_tsconfig_from_config_file(maybe_config_file)?;
    Ok(TsConfigForEmit {
        ts_config,
        maybe_ignored_options,
    })
}

impl From<TsConfig> for deno_ast::EmitOptions {
    fn from(config: TsConfig) -> Self {
        let options: EmitConfigOptions = serde_json::from_value(config.0).unwrap();
        let imports_not_used_as_values = match options.imports_not_used_as_values.as_str() {
            "preserve" => deno_ast::ImportsNotUsedAsValues::Preserve,
            "error" => deno_ast::ImportsNotUsedAsValues::Error,
            _ => deno_ast::ImportsNotUsedAsValues::Remove,
        };
        let (transform_jsx, jsx_automatic, jsx_development) = match options.jsx.as_str() {
            "react" => (true, false, false),
            "react-jsx" => (true, true, false),
            "react-jsxdev" => (true, true, true),
            _ => (false, false, false),
        };
        deno_ast::EmitOptions {
            emit_metadata: options.emit_decorator_metadata,
            imports_not_used_as_values,
            inline_source_map: options.inline_source_map,
            inline_sources: options.inline_sources,
            source_map: options.source_map,
            jsx_automatic,
            jsx_development,
            jsx_factory: options.jsx_factory,
            jsx_fragment_factory: options.jsx_fragment_factory,
            jsx_import_source: options.jsx_import_source,
            transform_jsx,
            var_decl_imports: false,
        }
    }
}
