# Distribution Guide

This guide explains how to package and distribute the MySQL MCP Server for end users.

## 📦 Distribution Options

### Option 1: NPM Package (Recommended)

**Pros:**
- Easy installation with `npm install -g mysql-mcp-server`
- Automatic dependency management
- Easy updates with `npm update -g mysql-mcp-server`
- Cross-platform compatibility

**Setup:**
1. **Publish to NPM:**
   ```bash
   npm login
   npm publish
   ```

2. **Users install with:**
   ```bash
   npm install -g mysql-mcp-server
   mysql-mcp-server --init
   ```

3. **VS Code configuration:**
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

### Option 2: Standalone Executables

**Pros:**
- No Node.js installation required
- Single file distribution
- Works on machines without npm

**Build executables:**
```bash
# All platforms
npm run build:all

# Individual platforms
npm run build:win    # Windows
npm run build:mac    # macOS
npm run build:linux  # Linux
```

**Distribution:**
- Upload executables to GitHub Releases
- Users download appropriate binary
- Include .env.example file separately

**VS Code configuration for standalone:**
```json
{
  "mcp": {
    "mcpServers": {
      "mysql-mcp-server": {
        "command": "C:/path/to/mysql-mcp-server.exe",
        "env": {}
      }
    }
  }
}
```

### Option 3: GitHub Release Package

**Pros:**
- Version controlled releases
- Easy download and setup
- Includes all source code

**Setup:**
1. **Create release package:**
   ```bash
   # Create distribution package
   npm pack
   
   # This creates mysql-mcp-server-1.0.0.tgz
   ```

2. **Users install from tarball:**
   ```bash
   npm install -g mysql-mcp-server-1.0.0.tgz
   ```

## 🚀 Release Process

### 1. Prepare Release
```bash
# Update version
npm version patch|minor|major

# Build all distribution formats
npm run build:all

# Create npm package
npm pack
```

### 2. GitHub Release
1. Create GitHub release with version tag
2. Upload built executables:
   - `dist/mysql-mcp-server-win.exe`
   - `dist/mysql-mcp-server-macos`
   - `dist/mysql-mcp-server-linux`
3. Upload npm package: `mysql-mcp-server-x.x.x.tgz`
4. Include `.env.example` file
5. Add installation instructions

### 3. NPM Publish
```bash
npm publish
```

## 📋 User Installation Instructions

Include these in your README and release notes:

### For NPM Installation
```bash
# Install globally
npm install -g mysql-mcp-server

# Initialize configuration
mkdir my-mysql-mcp && cd my-mysql-mcp
mysql-mcp-server --init

# Edit .env file with your database credentials
# Add to VS Code MCP settings
```

### For Standalone Executable
```bash
# Download appropriate executable for your platform
# Download .env.example file
# Rename .env.example to .env and configure
# Add executable path to VS Code MCP settings
```

## 🔧 Configuration Template

Provide this VS Code configuration template:

```json
{
  "mcp": {
    "mcpServers": {
      "mysql-mcp-server": {
        "command": "mysql-mcp-server",
        "env": {
          "MYSQL_ALLOWED_COMMANDS": "default"
        }
      }
    }
  }
}
```

## 📝 Documentation for Users

Ensure you provide:
- [ ] Clear installation instructions
- [ ] Database configuration examples
- [ ] VS Code setup guide
- [ ] Security level explanations
- [ ] Troubleshooting guide
- [ ] Multi-database configuration examples

## 🔒 Security Considerations

When distributing:
- Never include actual database credentials
- Recommend using environment-specific .env files
- Document security levels clearly
- Provide examples for different use cases
- Include IP whitelisting guidance

## 📊 Recommended Distribution Strategy

1. **Primary**: NPM package for developers
2. **Secondary**: Standalone executables for non-Node.js users
3. **Backup**: GitHub releases with multiple options

This provides maximum accessibility while maintaining ease of updates.
