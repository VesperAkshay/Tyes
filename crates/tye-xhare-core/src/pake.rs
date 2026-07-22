use spake2::{Spake2, Ed25519Group, Identity, Password};

use std::error::Error;

pub struct PakeState {
    pub state: Spake2<Ed25519Group>,
    pub msg: Vec<u8>,
}

pub fn init(password: &[u8], is_client: bool) -> Result<PakeState, Box<dyn Error>> {
    let pw = Password::new(password);
    let identity_client = Identity::new(b"client");
    let identity_server = Identity::new(b"server");
    
    let (state, msg) = if is_client {
        Spake2::<Ed25519Group>::start_a(&pw, &identity_client, &identity_server)
    } else {
        Spake2::<Ed25519Group>::start_b(&pw, &identity_client, &identity_server)
    };
    
    Ok(PakeState { state, msg })
}

impl PakeState {
    pub fn update(self, other_msg: &[u8]) -> Result<Vec<u8>, Box<dyn Error>> {
        self.state.finish(other_msg).map_err(|_| "PAKE error".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pake() {
        let pw = b"shared_password";
        
        let client = init(pw, true).unwrap();
        let server = init(pw, false).unwrap();
        
        let client_msg = client.msg.clone();
        let client_key = client.update(&server.msg).unwrap();
        let server_key = server.update(&client_msg).unwrap();
        
        assert_eq!(client_key, server_key);
    }
}
