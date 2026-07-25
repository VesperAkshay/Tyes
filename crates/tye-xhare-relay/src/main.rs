use clap::Parser;
use tye_xhare_relay::server::Server;

#[derive(Parser)]
#[command(name = "tye-xhare-relay", about = "Custom relay server for tye-xhare-rs", long_about = None)]
struct Cli {
    /// Ports to listen on (comma separated)
    #[arg(short, long, default_value = "9009,9010,9011,9012,9013")]
    ports: String,

    /// Password for relay authentication
    #[arg(long, default_value = "pass123")]
    pass: String,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    
    let ports_list: Vec<String> = cli.ports.split(',').map(|s| s.trim().to_string()).collect();
    
    println!("Starting tye-xhare custom relay on ports {:?}...", ports_list);
    let server = Server::new("0.0.0.0".to_string(), ports_list, cli.pass);
    
    if let Err(e) = server.run().await {
        eprintln!("Server error: {}", e);
    }
}
