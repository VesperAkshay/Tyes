use tokio::sync::{mpsc, oneshot};

#[derive(Debug)]
pub enum UiEvent {
    Log(String),
    Progress { filename: String, total: u64, current: u64 },
    Prompt { msg: String, reply: oneshot::Sender<bool> },
    Done(String),
    Error(String),
}

#[derive(Clone)]
pub struct EventSender {
    pub tx: Option<mpsc::Sender<UiEvent>>,
    pub auto_accept: bool,
}

impl EventSender {
    pub fn new(tx: Option<mpsc::Sender<UiEvent>>) -> Self {
        Self { tx, auto_accept: false }
    }
    
    pub fn new_auto_accept() -> Self {
        Self { tx: None, auto_accept: true }
    }

    pub fn log(&self, msg: impl Into<String>) {
        let msg = msg.into();
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(UiEvent::Log(msg.clone()));
        } else {
            println!("{}", msg);
        }
    }

    pub fn progress(&self, filename: impl Into<String>, total: u64, current: u64) {
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(UiEvent::Progress {
                filename: filename.into(),
                total,
                current,
            });
        }
    }

    pub async fn prompt(&self, msg: impl Into<String>) -> bool {
        if self.auto_accept { return true; }
        
        let msg = msg.into();
        if let Some(tx) = &self.tx {
            let (reply_tx, reply_rx) = oneshot::channel();
            if tx.try_send(UiEvent::Prompt { msg: msg.clone(), reply: reply_tx }).is_ok() {
                if let Ok(res) = reply_rx.await {
                    return res;
                }
            }
        }
        // Fallback for CLI mode
        println!("{} [Y/n]", msg);
        let mut input = String::new();
        if std::io::stdin().read_line(&mut input).is_ok() {
            let input = input.trim().to_lowercase();
            return input.is_empty() || input == "y" || input == "yes";
        }
        false
    }

    pub fn done(&self, msg: impl Into<String>) {
        let msg = msg.into();
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(UiEvent::Done(msg.clone()));
        } else {
            println!("{}", msg);
        }
    }

    pub fn error(&self, msg: impl Into<String>) {
        let msg = msg.into();
        if let Some(tx) = &self.tx {
            let _ = tx.try_send(UiEvent::Error(msg.clone()));
        } else {
            eprintln!("{}", msg);
        }
    }
}
