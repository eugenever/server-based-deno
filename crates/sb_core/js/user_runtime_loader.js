function loadUserRuntime() {
    delete globalThis.EdgeRuntime;
}

export { loadUserRuntime };