use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use thiserror::Error;
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TyeEvent {
    // Core-origin events
    ProjectOpened {
        project_id: Uuid,
        path: PathBuf,
    },

    // Git-origin events
    GitCommitCreated {
        project_id: Uuid,
        commit_oid: String,
        branch: String,
    },
    GitBranchSwitched {
        project_id: Uuid,
        from: String,
        to: String,
    },
    GitPushCompleted {
        project_id: Uuid,
        remote: String,
        branch: String,
    },
    GitMergeConflict {
        project_id: Uuid,
        files: Vec<PathBuf>,
    },

    // API-origin events
    ApiCollectionRunCompleted {
        project_id: Uuid,
        run_id: Uuid,
        passed: u32,
        failed: u32,
    },
    ApiRequestFailed {
        project_id: Uuid,
        request_id: Uuid,
        status: Option<u16>,
    },

    // Run-origin events
    RunTaskStarted {
        project_id: Uuid,
        task_id: Uuid,
    },
    RunTaskExited {
        project_id: Uuid,
        task_id: Uuid,
        exit_code: Option<i32>,
    },
    RunPipelineCompleted {
        project_id: Uuid,
        pipeline_id: Uuid,
        success: bool,
    },
}

#[derive(Error, Debug)]
pub enum EventError {
    #[error("No active subscribers on the event bus")]
    NoSubscribers,
    #[error("Broadcast channel error: {0}")]
    SendError(String),
}

pub type Result<T> = std::result::Result<T, EventError>;

#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<TyeEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    /// Publishes an event to all current subscribers.
    pub fn publish(&self, event: TyeEvent) -> Result<usize> {
        self.sender
            .send(event)
            .map_err(|_| EventError::NoSubscribers)
    }

    /// Subscribes to receive all future `TyeEvent` broadcasts.
    pub fn subscribe(&self) -> broadcast::Receiver<TyeEvent> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_event_bus() {
        let bus = EventBus::new(16);
        let mut rx = bus.subscribe();

        let event = TyeEvent::RunTaskStarted {
            project_id: Uuid::new_v4(),
            task_id: Uuid::new_v4(),
        };

        bus.publish(event.clone()).expect("Publish failed");
        let received = rx.recv().await.expect("Receive failed");
        assert_eq!(received, event);
    }
}

