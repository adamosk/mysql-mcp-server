# MySQL MCP Server

A sophisticated Model Context Protocol (MCP) server that provides secure, multi-database MySQL access with configurable security levels, lazy loading, and hot reload capabilities.

## 🚀 Features

- **🗄️ Multi-Database Support**: Configure and access multiple MySQL databases simultaneously
- **🔒 Configurable Security**: Four security levels from read-only to full access
- **⚡ Lazy Loading**: Connection pools created only when needed for optimal resource usage
- **🔄 Hot Reload**: Database configuration updates without server restart
- **📊 Complete Schema Information**: Full table definitions with indexes, foreign keys, and constraints
- **🛡️ Explicit Database Selection**: Required database parameter prevents accidental operations
- **🎯 MCP Protocol Integration**: Native VS Code integration with resource browsing

## 🔧 Installation

1. **Clone and Install**
   ```bash
   git clone <your-repository-url>
   cd mysql-mcp-server
   npm install
   ```

2. **Configure Multi-Database Setup**

   Copy the example configuration file and customize it:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your database configurations:
   ```env
   # Multi-Database Configuration (JSON Array)
   MYSQL_DATABASES='[
     {
       "name": "primary_db",
       "host": "localhost",
       "user": "your_username",
       "password": "your_password",
       "database": "your_database"
     },
     {
       "name": "analytics_db", 
       "host": "analytics.example.com",
       "user": "analytics_user",
       "password": "analytics_password",
       "database": "analytics"
     }
   ]'

   # Security Configuration
   # Options: (default), extended, all, or custom comma-separated list
   # MYSQL_ALLOWED_COMMANDS=extended

   # Connection Pool Settings
   MYSQL_CONNECTION_LIMIT=4
   MYSQL_WAIT_FOR_CONNECTIONS=true

   # Server Metadata
   MCP_SERVER_NAME=mysql-mcp-server
   MCP_SERVER_VERSION=1.0.0
   ```

3. **Add to VS Code MCP Configuration**

   Add to your VS Code `settings.json` under MCP servers:
   ```json
   {
     "mcp": {
       "mcpServers": {
         "mysql-mcp-server": {
           "command": "node",
           "args": ["C:/path/to/mysql-mcp-server/mcp-mysql-lite.js"],
           "env": {}
         }
       }
     }
   }
   ```

## 🔒 Security Levels

Configure `MYSQL_ALLOWED_COMMANDS` in your `.env` file:

### Default (Recommended)
```env
# MYSQL_ALLOWED_COMMANDS not set or commented out
```
**Allowed Commands**: `SELECT`, `SHOW`, `DESCRIBE`, `DESC`, `EXPLAIN`, `ANALYZE`  
**Use Case**: Safe read-only access for data analysis and exploration

### Extended
```env
MYSQL_ALLOWED_COMMANDS=extended
```
**Allowed Commands**: All default commands plus `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, etc.  
**Use Case**: Development environments where schema and data modifications are needed

### All (⚠️ Use with Extreme Caution)
```env
MYSQL_ALLOWED_COMMANDS=all
```
**Allowed Commands**: No restrictions - all SQL commands permitted  
**Use Case**: Trusted environments requiring full database administration capabilities

### Custom
```env
MYSQL_ALLOWED_COMMANDS="SELECT,INSERT,UPDATE,CREATE TABLE"
```
**Allowed Commands**: User-defined comma-separated list  
**Use Case**: Specific operational requirements with tailored permissions

## 🛠️ Available Tools

All tools require explicit database selection for security.

### `query_database`

Execute SQL queries with security validation and explicit database selection.

- **Parameters**:
  - `sql` (string, **required**) - The SQL query to execute
  - `database` (string, **required**) - Database name to target (security requirement)
- **Security**: Commands validated against current security level
- **Returns**: Query results with execution metadata

### `describe_table`

Get complete table structure using `SHOW CREATE TABLE` for comprehensive schema information.

- **Parameters**:
  - `table_name` (string, **required**) - Name of the table to describe
  - `database` (string, **required**) - Database containing the table (security requirement)
- **Returns**: Full table definition including columns, indexes, foreign keys, and engine details

### `list_databases`

Display all configured databases and their connection status.

- **Parameters**: None required
- **Returns**: Database configurations with connection pool status and default database indicator

## 📚 Available Resources

Tables from the default database are exposed as MCP resources with URIs like:
```text
mysql://database_name/table/table_name
```

Browse table schemas directly through VS Code's resource explorer.

## 💡 Usage Examples

### Basic Database Query
```sql
-- Query with explicit database selection (security requirement)
SELECT COUNT(*) FROM users WHERE active = 1
```
**Database**: `primary_db`

### Multi-Database Operations
```sql
-- Analytics query on different database
SELECT DATE(created_at), COUNT(*) 
FROM events 
WHERE event_type = 'purchase' 
GROUP BY DATE(created_at) 
ORDER BY DATE(created_at) DESC 
LIMIT 7
```
**Database**: `analytics_db`

### Table Schema Exploration

Use `describe_table` tool:

- **Table**: `users`
- **Database**: `primary_db`

Returns complete table definition with foreign keys, indexes, and constraints.

### Database Discovery
Use `list_databases` tool to see all configured databases and their connection status:
```json
[
  {
    "name": "primary_db",
    "host": "localhost", 
    "database": "app_production",
    "user": "app_user",
    "isDefault": true,
    "poolCreated": true
  },
  {
    "name": "analytics_db",
    "host": "analytics.company.com",
    "database": "analytics",
    "user": "analytics_user", 
    "isDefault": false,
    "poolCreated": false
  }
]
```

## 🔄 Hot Reload Feature

Update database configurations in `.env` file - they'll be automatically reloaded:

- ✅ **Credential updates**: New passwords/users applied immediately
- ✅ **New databases**: Added to available list (restart VS Code to update tool schemas)
- ✅ **Configuration changes**: Host/port updates applied on next connection
- 🔄 **Existing connections**: Remain active until naturally recycled

## ⚡ Lazy Loading

Connection pools are created only when needed:

- 📊 **Resource efficient**: No unnecessary database connections
- 🚀 **Fast startup**: Server starts immediately regardless of database availability  
- 🔍 **Status visibility**: `list_databases` shows which pools are active
- 🛡️ **Failure isolation**: One database issue doesn't affect others

## 🏗️ Architecture

```text
VS Code MCP Client
       ↓ (stdio)
MySQL MCP Server
       ↓ (lazy loading)
Connection Pools
       ↓ (MySQL protocol)  
Multiple Databases
```

Key design principles:

- **Multi-Database**: Each database has independent configuration and connection pool
- **Security**: Command validation before execution, explicit database selection required
- **Performance**: Lazy loading + connection pooling for optimal resource usage
- **Reliability**: Hot reload + error isolation for production stability

## 🚀 Development

### Running the Server
```bash
npm start
```

### Testing Configuration
```bash
# Test connection to all configured databases
node mcp-mysql-lite.js
```

### Environment Variables

- `MYSQL_DATABASES`: JSON array of database configurations
- `MYSQL_ALLOWED_COMMANDS`: Security level (default/extended/all/custom)
- `MYSQL_CONNECTION_LIMIT`: Max connections per pool (default: 4)
- `MYSQL_WAIT_FOR_CONNECTIONS`: Wait for available connections (default: true)

## 📄 License

MIT License - see LICENSE file for details.

---

Built with ❤️ for the Model Context Protocol ecosystem
