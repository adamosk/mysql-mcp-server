#!/usr/bin/env node
/**
 * MySQL MCP Server
 * 
 * A Model Context Protocol (MCP) server that provides secure MySQL database access
 * with multi-database support, lazy loading, hot reloading, and configurable security.
 * 
 * Features:
 * - Multi-database configuration support
 * - Lazy loading connection pools (created only when needed)
 * - Hot reload of database configurations without restart
 * - Configurable SQL command security (default/extended/all/custom)
 * - Complete table schema information using SHOW CREATE TABLE
 * - Explicit database parameter requirement for security
 * 
 * Security Levels:
 * - Default: Safe read-only commands (SELECT, SHOW, DESCRIBE, etc.)
 * - Extended: Includes write operations (INSERT, UPDATE, DELETE, CREATE, etc.)
 * - All: No restrictions (USE WITH EXTREME CAUTION!)
 * - Custom: User-defined comma-separated command list
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import mysql from 'mysql2/promise';

/**
 * MySQL MCP Server Class
 * 
 * Main server class that handles MCP protocol communication and MySQL operations.
 * Implements lazy loading, hot reload, and security features.
 */
class MySQLMCPServer {
  constructor() {
    // Initialize MCP server with metadata from environment variables
    this.server = new Server(
      {
        name: process.env.MCP_SERVER_NAME ?? 'mysql-mcp-server',
        version: process.env.MCP_SERVER_VERSION ?? '1.0.0',
      },
      {
        capabilities: {
          resources: {}, // Provides table schemas as resources
          tools: {},     // Provides database query/management tools
        },
      }
    );

    // Setup request handlers and database configurations
    this.setupHandlers();
    this.setupDatabase();
  }

  /**
   * Initialize database configurations and security settings
   * 
   * Sets up:
   * - Database configuration storage (lazy loading - no connections created yet)
   * - Connection pool storage for active connections
   * - Default database tracking
   * - SQL command security settings
   * - Initial configuration loading from .env file
   */
  async setupDatabase() {
    // Setup database configurations from MYSQL_DATABASES (lazy loading - no pools created yet)
    this.databaseConfigs = new Map();  // Stores database connection configs
    this.databasePools = new Map();    // Stores active connection pools (created on demand)
    this.defaultDatabase = null;       // First database in config array (for resource listing)
    
    // Setup allowed SQL commands (secure by default)
    this.setupAllowedCommands();
    
    // Load initial database configurations from .env file
    await this.reloadDatabaseConfigs();
  }

  /**
   * Setup allowed SQL commands with configurable security levels
   * 
   * Security Levels:
   * - Default: Read-only operations (SELECT, SHOW, DESCRIBE, etc.)
   * - Extended: Includes write operations (INSERT, UPDATE, DELETE, CREATE, etc.)
   * - All: No restrictions (null value) - USE WITH EXTREME CAUTION!
   * - Custom: User-defined comma-separated list of allowed commands
   * 
   * Environment Variable: MYSQL_ALLOWED_COMMANDS
   */
  setupAllowedCommands() {
    // Default safe commands (read-only operations)
    const defaultCommands = [
      'SELECT', 'SHOW', 'DESCRIBE', 'DESC', 'EXPLAIN', 'ANALYZE'
    ];

    // Extended commands for power users (includes schema operations)
    const extendedCommands = [
      ...defaultCommands,
      'CREATE TABLE', 'CREATE INDEX', 'CREATE VIEW', 'CREATE TEMPORARY TABLE',
      'ALTER TABLE', 'DROP TABLE', 'DROP INDEX', 'DROP VIEW',
      'INSERT', 'UPDATE', 'DELETE', 'REPLACE',
      'TRUNCATE', 'OPTIMIZE TABLE', 'REPAIR TABLE', 'CHECK TABLE'
    ];

    // Parse allowed commands from environment or use default
    const allowedCommandsEnv = process.env.MYSQL_ALLOWED_COMMANDS;
    
    if (allowedCommandsEnv) {
      try {
        if (allowedCommandsEnv.toLowerCase() === 'extended') {
          this.allowedCommands = extendedCommands;
          console.error('🔓 Extended SQL command set enabled (includes write operations)');
        } else if (allowedCommandsEnv.toLowerCase() === 'all') {
          this.allowedCommands = null; // null means no restrictions
          console.error('⚠️  All SQL commands allowed (no restrictions) - USE WITH CAUTION!');
        } else {
          // Custom list of commands (comma-separated)
          this.allowedCommands = allowedCommandsEnv.split(',').map(cmd => cmd.trim().toUpperCase());
          console.error(`🔧 Custom SQL commands allowed: ${this.allowedCommands.join(', ')}`);
        }
      } catch (error) {
        console.error('❌ Failed to parse MYSQL_ALLOWED_COMMANDS, using default safe commands');
        this.allowedCommands = defaultCommands;
      }
    } else {
      // No environment variable set - use safe defaults
      this.allowedCommands = defaultCommands;
      console.error('🔒 Default safe SQL commands only (read-only operations)');
    }
  }

  /**
   * Check if a SQL command is allowed based on current security settings
   * 
   * @param {string} sql - The SQL query to validate
   * @returns {Object} - Object with allowed (boolean), reason/command (string)
   * 
   * Security Logic:
   * - If allowedCommands is null: All commands allowed
   * - Otherwise: Check if query starts with any allowed command pattern
   * - Uses regex to match command at start of query (case-insensitive)
   */
  isCommandAllowed(sql) {
    // No restrictions if allowedCommands is null (security level: all)
    if (this.allowedCommands === null) {
      return { allowed: true, reason: 'All commands allowed' };
    }

    const trimmedSql = sql.trim().toUpperCase();
    
    // Check each allowed command pattern
    for (const command of this.allowedCommands) {
      // Create regex pattern to match command at start of query
      // Handles multi-word commands like "CREATE TABLE" correctly
      const commandPattern = new RegExp(`^\\s*${command.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (commandPattern.test(trimmedSql)) {
        return { allowed: true, command: command };
      }
    }

    // Command not found in allowed list
    return { 
      allowed: false, 
      reason: `Command not allowed. Permitted commands: ${this.allowedCommands.join(', ')}. To enable more commands, set MYSQL_ALLOWED_COMMANDS in your .env file.`
    };
  }

  /**
   * Reload database configurations from .env file (enables hot reloading)
   * 
   * This method enables hot reloading by:
   * 1. Reading the .env file directly from disk (process.env doesn't auto-update)
   * 2. Parsing the MYSQL_DATABASES JSON configuration
   * 3. Updating internal configuration maps
   * 4. Setting the first database as default
   * 
   * Note: This only updates configurations, existing connection pools remain active
   * until they're explicitly recreated or the server restarts.
   */
  async reloadDatabaseConfigs() {
    console.error('🔄 Reloading database configurations from .env file...');
    const oldConfigCount = this.databaseConfigs.size;
    this.databaseConfigs.clear();
    this.defaultDatabase = null;
    
    try {
      // Re-read the .env file directly since process.env doesn't auto-update
      const fs = await import('fs');
      const path = await import('path');
      
      const envPath = path.resolve('.env');
      const envContent = fs.readFileSync(envPath, 'utf8');
      
      // Parse the MYSQL_DATABASES from the .env file content using regex
      // Format: MYSQL_DATABASES='[{...}]'
      const mysqlDbMatch = envContent.match(/MYSQL_DATABASES='(.+)'/s);
      if (!mysqlDbMatch) {
        throw new Error('MYSQL_DATABASES not found in .env file');
      }
      
      // Get the JSON string (already without the outer quotes)
      const mysqlDbValue = mysqlDbMatch[1];
      
      // Parse JSON and store configurations
      const dbConfigs = JSON.parse(mysqlDbValue);
      for (const [index, config] of dbConfigs.entries()) {
        // Store only configuration, don't create pool yet (lazy loading)
        this.databaseConfigs.set(config.name, config);

        // First database is the default (used for resource listing)
        if (index === 0) {
          this.defaultDatabase = config.name;
        }
      }
      
      // Log reload results
      const newConfigCount = this.databaseConfigs.size;
      if (newConfigCount !== oldConfigCount) {
        console.error(`✅ Configuration reloaded: ${oldConfigCount} → ${newConfigCount} databases`);
        console.error(`💡 Note: New databases require VS Code restart to appear in tool suggestions`);
      } else {
        console.error(`✅ Reloaded ${newConfigCount} database configurations (credentials updated)`);
      }
    } catch (error) {
      console.error('❌ Failed to reload database configurations:', error.message);
      throw error;
    }

    // Ensure at least one database is configured
    if (this.databaseConfigs.size === 0) {
      throw new Error('No database configurations found. Please configure MYSQL_DATABASES in your .env file.');
    }
  }

  /**
   * Get or create a database connection pool with lazy loading and hot reload fallback
   * 
   * Lazy Loading Strategy:
   * 1. Check if pool already exists in cache - return if found
   * 2. Check if database configuration exists - reload configs if not found
   * 3. Create new connection pool using mysql2/promise
   * 4. Cache the pool for future use
   * 
   * Hot Reload Integration:
   * - If database not found in current config, attempt to reload from .env
   * - If connection fails, attempt to reload configs (maybe credentials changed)
   * - Prevents infinite recursion with retryAfterReload flag
   * 
   * @param {string} databaseName - Name of the database to connect to
   * @param {boolean} retryAfterReload - Prevents infinite recursion during reload attempts
   * @returns {Promise<mysql.Pool>} - MySQL connection pool
   */
  async getOrCreatePool(databaseName, retryAfterReload = true) {
    // Return existing pool if already created (lazy loading cache hit)
    if (this.databasePools.has(databaseName)) {
      return this.databasePools.get(databaseName);
    }

    // Check if configuration exists
    if (!this.databaseConfigs.has(databaseName)) {
      if (retryAfterReload) {
        console.error(`Database '${databaseName}' not found in current config. Attempting to reload configurations...`);
        try {
          await this.reloadDatabaseConfigs();
          
          // Check if the database is now available after reload
          if (this.databaseConfigs.has(databaseName)) {
            // Retry once after reload (avoid infinite recursion)
            return await this.getOrCreatePool(databaseName, false);
          } else {
            // Database still not found after reload
            throw new Error(`Database '${databaseName}' is not configured in your .env file. Available databases: ${Array.from(this.databaseConfigs.keys()).join(', ')}.\n\n💡 Developer Tip: If you just added this database to your .env file, please restart VS Code or reload the MCP server to register the new database in the tool schema.`);
          }
        } catch (reloadError) {
          console.error('Failed to reload configurations:', reloadError.message);
          throw new Error(`Database '${databaseName}' is not configured. Available databases: ${Array.from(this.databaseConfigs.keys()).join(', ')}.\n\n💡 Developer Tip: Check your .env file configuration or restart VS Code if you recently made changes.`);
        }
      }
      
      throw new Error(`Database '${databaseName}' is not configured. Available databases: ${Array.from(this.databaseConfigs.keys()).join(', ')}.\n\n💡 Developer Tip: If you just added this database to your .env file, please restart VS Code to update the tool schema.`);
    }

    // Create new connection pool
    const config = this.databaseConfigs.get(databaseName);
    try {
      const pool = await mysql.createPool({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.database,
        waitForConnections: process.env.MYSQL_WAIT_FOR_CONNECTIONS === 'true',
        connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT ?? '4'),
        namedPlaceholders: true, // Enable named placeholders for security
      });

      // Cache the pool for future use (lazy loading cache store)
      this.databasePools.set(databaseName, pool);
      console.error(`✅ Created connection pool for database: ${databaseName}`);
      
      return pool;
    } catch (error) {
      // If connection fails and we haven't tried reloading yet, try reloading configs
      // This handles cases where credentials were updated in .env
      if (retryAfterReload) {
        console.error(`Connection failed for '${databaseName}': ${error.message}. Attempting to reload configurations...`);
        try {
          await this.reloadDatabaseConfigs();
          
          // Retry once after reload (avoid infinite recursion)
          return await this.getOrCreatePool(databaseName, false);
        } catch (reloadError) {
          console.error('Failed to reload configurations after connection error:', reloadError.message);
          throw new Error(`Failed to connect to database '${databaseName}': ${error.message}\n\n💡 Developer Tip: Check your credentials in the .env file. If you just updated them, they should auto-reload. For persistent issues, restart VS Code.`);
        }
      }
      
      throw new Error(`Failed to connect to database '${databaseName}': ${error.message}\n\n💡 Developer Tip: Check your credentials, network connectivity, or IP whitelist settings. Updated credentials are automatically reloaded.`);
    }
  }

  /**
   * Setup MCP request handlers for tools, resources, and tool execution
   * 
   * This method sets up all the MCP protocol handlers:
   * - ListToolsRequestSchema: Returns available tools (query_database, describe_table, list_databases)
   * - ListResourcesRequestSchema: Returns table schemas as resources
   * - ReadResourceRequestSchema: Returns specific table CREATE statements
   * - CallToolRequestSchema: Executes tool requests with security validation
   */
  setupHandlers() {
    /**
     * Helper method to execute queries with explicit database requirement
     * 
     * Security Enhancement: Database parameter is always required - no defaults!
     * This prevents accidental queries against unintended databases.
     * 
     * @param {Function} queryFn - Async function that accepts a connection pool
     * @param {string} database - Database name (REQUIRED - no fallback to default)
     * @returns {Promise} - Query result
     */
    const executeWithDatabase = async (queryFn, database) => {
      if (!database) {
        throw new Error('Database parameter is required. Please specify which database to use.');
      }

      // Get or create pool (lazy loading with hot reload fallback)
      const pool = await this.getOrCreatePool(database);
      return await queryFn(pool);
    };

    /**
     * Helper method to get list of available databases for tool descriptions
     * 
     * @returns {Array<string>} - Array of configured database names
     */
    const getAvailableDatabases = () => {
      return Array.from(this.databaseConfigs.keys());
    };

    /**
     * MCP Handler: List available tools
     * 
     * Returns the three main tools provided by this server:
     * 1. query_database: Execute SQL queries with security validation
     * 2. describe_table: Get complete table structure using SHOW CREATE TABLE  
     * 3. list_databases: Show all configured databases and their status
     * 
     * Security: All tools require explicit database parameter (no defaults)
     */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'query_database',
          description: `Execute SQL queries on a MySQL database. Available databases: ${getAvailableDatabases().join(', ')}. Allowed commands: ${this.allowedCommands ? this.allowedCommands.join(', ') : 'ALL (use with caution)'}`,
          inputSchema: {
            type: 'object',
            properties: {
              sql: {
                type: 'string',
                description: 'The SQL query to execute',
              },
              database: {
                type: 'string',
                description: `Database name to query. Available: ${getAvailableDatabases().join(', ')}`,
              },
            },
            required: ['sql', 'database'], // Both parameters are required for security
          },
        },
        {
          name: 'describe_table',
          description: `Get the structure of a database table. Available databases: ${getAvailableDatabases().join(', ')}`,
          inputSchema: {
            type: 'object',
            properties: {
              table_name: {
                type: 'string',
                description: 'The name of the table to describe',
              },
              database: {
                type: 'string',
                description: `Database name containing the table. Available: ${getAvailableDatabases().join(', ')}`,
              },
            },
            required: ['table_name', 'database'], // Both parameters are required for security
          },
        },
        {
          name: 'list_databases',
          description: 'List all configured databases in this MCP server',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [], // No parameters needed - shows all configured databases
          },
        },
      ],
    }));

    /**
     * MCP Handler: List available resources (table schemas from default database)
     * 
     * Resources in MCP represent data that can be read. This handler provides
     * table schemas as resources, allowing VS Code to show them in the resource browser.
     * 
     * Note: Only lists tables from the default database to avoid overwhelming the UI
     * with too many resources when multiple databases are configured.
     */
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        // Return empty resources if no default database configured
        if (!this.defaultDatabase) {
          return { resources: [] };
        }

        // Get connection pool for default database
        const pool = await this.getOrCreatePool(this.defaultDatabase);
        const config = this.databaseConfigs.get(this.defaultDatabase);
        
        // Query INFORMATION_SCHEMA to get list of tables
        const [tables] = await pool.query(
          `SELECT TABLE_NAME
           FROM INFORMATION_SCHEMA.TABLES
           WHERE TABLE_SCHEMA = ?
           ORDER BY TABLE_NAME`,
          [config.database]
        );

        // Convert tables to MCP resource format
        return {
          resources: tables.map(row => ({
            uri: `mysql://${this.defaultDatabase}/table/${row.TABLE_NAME}`,
            name: `${this.defaultDatabase}.${row.TABLE_NAME}`,
            description: `Table: ${row.TABLE_NAME} in ${this.defaultDatabase}`,
            mimeType: 'text/plain',
          })),
        };
      } catch (error) {
        throw new Error(`Failed to list tables: ${error.message}`);
      }
    });

    /**
     * MCP Handler: Read resource (get table schema using SHOW CREATE TABLE)
     * 
     * When a user requests a specific table resource, this handler returns
     * the complete table definition using SHOW CREATE TABLE, which provides:
     * - Column definitions with types and constraints
     * - Index definitions
     * - Foreign key relationships
     * - Table engine and charset information
     * 
     * This is more comprehensive than DESCRIBE TABLE which only shows basic column info.
     */
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      // Parse URI format: mysql://database/table/tablename
      const match = uri.match(/^mysql:\/\/([^\/]+)\/table\/(.+)$/);
      
      if (!match) {
        throw new Error(`Invalid resource URI: ${uri}. Expected format: mysql://database/table/tablename`);
      }

      const [, databaseName, tableName] = match;
      
      // Validate database is configured
      if (!this.databaseConfigs.has(databaseName)) {
        throw new Error(`Database '${databaseName}' is not configured`);
      }

      try {
        // Get connection pool and execute SHOW CREATE TABLE
        const pool = await this.getOrCreatePool(databaseName);
        const [[result]] = await pool.query(
          `SHOW CREATE TABLE ??`,
          [tableName]
        );

        // Return the complete table definition
        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: result['Create Table'],
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to describe table ${tableName} in database ${databaseName}: ${error.message}`);
      }
    });

    /**
     * MCP Handler: Execute tool calls
     * 
     * This is the main handler that processes tool execution requests.
     * It implements security validation, database connection management,
     * and error handling for all three tools.
     * 
     * Security Features:
     * - SQL command validation against allowed command list
     * - Explicit database parameter requirement
     * - Detailed error messages with helpful developer tips
     */
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        /**
         * Tool: query_database
         * 
         * Executes SQL queries with security validation and database selection.
         * 
         * Security Checks:
         * 1. Validates SQL parameter is provided
         * 2. Checks if SQL command is in allowed list
         * 3. Requires explicit database parameter
         * 
         * Returns formatted results with execution metadata.
         */
        case 'query_database': {
          const sql = args.sql;
          const database = args.database;
          
          // Validate required SQL parameter
          if (!sql) {
            throw new Error('SQL query is required');
          }

          // Security: Check if command is allowed based on current security settings
          const commandCheck = this.isCommandAllowed(sql);
          if (!commandCheck.allowed) {
            throw new Error(`Security: ${commandCheck.reason}`);
          }

          try {
            // Execute query with explicit database requirement
            const [rows] = await executeWithDatabase(
              async (connection) => connection.query(sql),
              database
            );
            
            // Prepare result metadata
            const dbInfo = database ? ` (database: ${database})` : '';
            const commandInfo = commandCheck.command ? ` (${commandCheck.command})` : '';
            
            // Handle different types of query results
            if (Array.isArray(rows)) {
              // SELECT and other queries that return row arrays
              return {
                content: [
                  {
                    type: 'text',
                    text: `Query executed successfully${dbInfo}${commandInfo}. Returned ${rows.length} rows.\n\n${JSON.stringify(rows, null, 2)}`,
                  },
                ],
              };
            } else {
              // INSERT, UPDATE, DELETE and other queries that return result objects
              return {
                content: [
                  {
                    type: 'text',
                    text: `Query executed successfully${dbInfo}${commandInfo}.\n\nResult: ${JSON.stringify(rows, null, 2)}`,
                  },
                ],
              };
            }
          } catch (error) {
            throw new Error(`Query failed: ${error.message}`);
          }
        }

        /**
         * Tool: describe_table
         * 
         * Returns complete table structure using SHOW CREATE TABLE.
         * This provides more comprehensive information than DESCRIBE TABLE,
         * including indexes, foreign keys, and table engine details.
         * 
         * Requires both table_name and database parameters for security.
         */
        case 'describe_table': {
          const tableName = args.table_name;
          const database = args.database;
          
          // Validate required table name parameter
          if (!tableName) {
            throw new Error('Table name is required');
          }

          try {
            // Execute SHOW CREATE TABLE with explicit database requirement
            const result = await executeWithDatabase(async (connection) => {
              // Get the complete table definition using SHOW CREATE TABLE
              const [[createResult]] = await connection.query(
                `SHOW CREATE TABLE ??`,
                [tableName]
              );

              return createResult;
            }, database);

            // Format response with database information
            const dbInfo = database ? ` from database ${database}` : '';
            return {
              content: [
                {
                  type: 'text',
                  text: `Table definition for ${tableName}${dbInfo}:\n\n${result['Create Table']}`,
                },
              ],
            };
          } catch (error) {
            throw new Error(`Failed to describe table ${tableName}: ${error.message}`);
          }
        }

        /**
         * Tool: list_databases
         * 
         * Returns information about all configured databases including:
         * - Database name and connection details
         * - Default database indicator
         * - Connection pool status (lazy loading indicator)
         * 
         * This tool doesn't require any parameters and shows the current
         * state of the multi-database configuration.
         */
        case 'list_databases': {
          try {
            // Build database information from current configurations
            const configuredDatabases = Array.from(this.databaseConfigs.entries()).map(([name, config]) => ({
              name: name,
              host: config.host,
              database: config.database,
              user: config.user,
              isDefault: name === this.defaultDatabase,
              poolCreated: this.databasePools.has(name) // Shows lazy loading status
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: `Configured databases:\n\n${JSON.stringify(configuredDatabases, null, 2)}`,
                },
              ],
            };
          } catch (error) {
            throw new Error(`Failed to list databases: ${error.message}`);
          }
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Start the MCP server
   * 
   * Initializes the stdio transport and connects the server to VS Code.
   * The server communicates with VS Code through stdin/stdout using the MCP protocol.
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MySQL MCP server running on stdio');
  }

  /**
   * Gracefully close all database connections
   * 
   * This method ensures all active connection pools are properly closed
   * when the server shuts down. Only closes pools that were actually created
   * (respects lazy loading - doesn't create pools just to close them).
   */
  async close() {
    // Close all created database connection pools (only those that were actually created)
    for (const [name, pool] of this.databasePools) {
      try {
        await pool.end();
        console.error(`Closed connection pool for database: ${name}`);
      } catch (error) {
        console.error(`Failed to close connection for database ${name}:`, error.message);
      }
    }
  }
}

// ============================================================================
// COMMAND LINE INTERFACE AND INITIALIZATION
// ============================================================================

/**
 * Handle command line arguments for initialization and help
 */
function handleCliArgs() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
MySQL MCP Server v${process.env.MCP_SERVER_VERSION || '1.0.0'}

Usage:
  mysql-mcp-server [options]

Options:
  --init    Initialize configuration in current directory
  --help    Show this help message

For setup instructions, see: https://github.com/your-username/mysql-mcp-server
`);
    process.exit(0);
  }
  
  if (args.includes('--init')) {
    initializeConfig();
    process.exit(0);
  }
}

/**
 * Initialize configuration in current directory
 */
async function initializeConfig() {
  const fs = await import('fs');
  const path = await import('path');
  
  try {
    // Check if .env already exists
    if (fs.existsSync('.env')) {
      console.log('⚠️  .env file already exists. Not overwriting.');
      return;
    }
    
    // Find .env.example file
    let examplePath = '.env.example';
    if (!fs.existsSync(examplePath)) {
      // Try looking in node_modules if globally installed
      const nodeModulesPath = path.join(process.cwd(), 'node_modules', 'mysql-mcp-server', '.env.example');
      if (fs.existsSync(nodeModulesPath)) {
        examplePath = nodeModulesPath;
      } else {
        console.error('❌ .env.example file not found. Please check installation.');
        return;
      }
    }
    
    // Copy .env.example to .env
    fs.copyFileSync(examplePath, '.env');
    
    console.log(`
✅ Configuration initialized!

Next steps:
1. Edit .env file with your database credentials
2. Add mysql-mcp-server to your VS Code MCP settings
3. Restart VS Code

For detailed setup instructions, see INSTALL.md
`);
    
  } catch (error) {
    console.error('❌ Failed to initialize configuration:', error.message);
  }
}

// Handle CLI arguments before starting server
handleCliArgs();

// ============================================================================
// SERVER INITIALIZATION AND PROCESS MANAGEMENT
// ============================================================================

/**
 * Create and initialize the MySQL MCP Server instance
 * 
 * The server automatically:
 * - Loads database configurations from .env file
 * - Sets up security command restrictions
 * - Prepares MCP protocol handlers
 * - Initializes lazy loading connection management
 */
const server = new MySQLMCPServer();

/**
 * Graceful shutdown handlers
 * 
 * These handlers ensure that all database connections are properly closed
 * when the process receives termination signals, preventing connection leaks
 * and ensuring clean shutdown.
 */
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});

/**
 * Start the MCP server
 * 
 * This begins the main server loop, listening for MCP protocol messages
 * from VS Code through stdin/stdout communication.
 */
await server.run();
