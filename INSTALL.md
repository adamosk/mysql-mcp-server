# MySQL MCP Server - Installation Guide

## 🚀 Quick Start

### Option 1: Global Installation (Recommended)

```bash
# Install globally
npm install -g mysql-mcp-server

# Create a directory for your configuration
mkdir my-mysql-mcp
cd my-mysql-mcp

# Initialize configuration
mysql-mcp-server --init

# Edit the .env file with your database credentials
# Copy .env.example to .env and configure
```

### Option 2: Local Installation

```bash
# Install in current directory
npm install mysql-mcp-server

# Copy example configuration
cp node_modules/mysql-mcp-server/.env.example .env

# Edit .env with your database credentials
```

### Option 3: Clone and Build

```bash
# Clone the repository
git clone https://github.com/your-username/mysql-mcp-server.git
cd mysql-mcp-server

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your database credentials
```

## ⚙️ VS Code Configuration

Add to your VS Code `settings.json`:

```json
{
  "mcp": {
    "mcpServers": {
      "mysql-mcp-server": {
        "command": "mysql-mcp-server",
        "env": {}
      }
    }
  }
}
```

Or if using local installation:

```json
{
  "mcp": {
    "mcpServers": {
      "mysql-mcp-server": {
        "command": "node",
        "args": ["node_modules/mysql-mcp-server/mcp-mysql-lite.js"],
        "env": {}
      }
    }
  }
}
```

## 🔧 Configuration

1. **Copy the example configuration:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your database details:**
   ```env
   MYSQL_DATABASES='[
     {
       "name": "my_database",
       "host": "localhost",
       "user": "your_username", 
       "password": "your_password",
       "database": "your_database_name"
     }
   ]'
   
   # Optional: Set security level
   # MYSQL_ALLOWED_COMMANDS=extended
   ```

3. **Restart VS Code** to load the new MCP server

## 🛠️ Troubleshooting

- **Server not appearing in VS Code**: Check VS Code settings and restart
- **Connection errors**: Verify database credentials and network access
- **Permission denied**: Check MySQL user permissions and IP whitelist

## 📚 Documentation

See the main [README.md](README.md) for complete documentation.
