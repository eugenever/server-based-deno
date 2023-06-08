use deno_core::error::bad_resource;
use deno_core::error::custom_error;
use deno_core::error::AnyError;
use deno_core::op;
use deno_core::AsyncRefCell;
use deno_core::CancelHandle;
use deno_core::CancelTryFuture;
use deno_core::OpState;
use deno_core::RcRef;
use deno_core::Resource;
use deno_core::ResourceId;
use deno_net::io::TcpStreamResource;
use deno_net::ops::IpAddr;
use std::borrow::Cow;
use std::cell::RefCell;
use std::rc::Rc;

pub struct TcpListenerResource {
    pub listener: AsyncRefCell<tokio::net::TcpListener>,
    pub cancel: CancelHandle,
}

impl Resource for TcpListenerResource {
    fn name(&self) -> Cow<str> {
        "tcpListener".into()
    }

    fn close(self: Rc<Self>) {
        self.cancel.cancel();
    }
}

#[op]
fn op_net_listen(state: Rc<RefCell<OpState>>) -> Result<(ResourceId, IpAddr), AnyError> {
    let listener = {
        let mut op_state = state.borrow_mut();
        op_state.try_take::<tokio::net::TcpListener>()
    };
    if listener.is_none() {
        return Err(bad_resource("TCPListener is not present in GothamState"));
    }
    let listener = listener.unwrap();
    let local_addr = listener.local_addr().unwrap();
    let resource = TcpListenerResource {
        listener: AsyncRefCell::new(listener),
        cancel: Default::default(),
    };
    let mut op_state = state.borrow_mut();
    let rid = op_state.resource_table.add(resource);
    // println!("op_net_listen, addr = {}", local_addr);
    Ok((rid, IpAddr::from(local_addr)))
}

#[op]
async fn op_net_accept(
    state: Rc<RefCell<OpState>>,
    rid: ResourceId,
) -> Result<(ResourceId, IpAddr, IpAddr), AnyError> {
    let resource = state
        .borrow()
        .resource_table
        .get::<TcpListenerResource>(rid)
        .map_err(|_| bad_resource("Listener has been closed"))?;

    let listener = RcRef::map(&resource, |r| &r.listener)
        .try_borrow_mut()
        .ok_or_else(|| custom_error("Busy", "Another accept task is ongoing"))?;

    let cancel = RcRef::map(resource, |r| &r.cancel);

    let (tcp_stream, _socket_addr) = listener
        .accept()
        .try_or_cancel(cancel)
        .await
        .map_err(accept_err)?;

    let local_addr = tcp_stream.local_addr()?;

    let remote_addr = tcp_stream.peer_addr()?;

    let mut state = state.borrow_mut();
    let rid = state
        .resource_table
        .add(TcpStreamResource::new(tcp_stream.into_split()));
    // println!("op_net_accept, addr = {}, {}", local_addr, remote_addr);
    Ok((rid, IpAddr::from(local_addr), IpAddr::from(remote_addr)))
}

pub(crate) fn accept_err(e: std::io::Error) -> AnyError {
    // FIXME(bartlomieju): compatibility with current JS implementation
    if let std::io::ErrorKind::Interrupted = e.kind() {
        bad_resource("Listener has been closed")
    } else {
        e.into()
    }
}

// TODO: This should be a global ext
#[op]
fn op_net_unsupported(_state: &mut OpState) -> Result<(), AnyError> {
    Err(deno_core::error::not_supported())
}

deno_core::extension!(
    sb_core_net,
    middleware = |op| match op.name {
        "op_net_listen_tcp" => op_net_listen::decl(),
        "op_net_accept_tcp" => op_net_accept::decl(),

        // disable listening on TLS, UDP and Unix sockets
        "op_net_listen_tls" => op_net_unsupported::decl(),
        "op_net_listen_udp" => op_net_unsupported::decl(),
        "op_node_unstable_net_listen_udp" => op_net_unsupported::decl(),
        "op_net_listen_unix" => op_net_unsupported::decl(),
        "op_net_listen_unixpacket" => op_net_unsupported::decl(),
        "op_node_unstable_net_listen_unixpacket" => op_net_unsupported::decl(),
        _ => op,
    }
);
