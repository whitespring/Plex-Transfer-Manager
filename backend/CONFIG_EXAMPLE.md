# Configuration Example

## Separate Movie and TV Paths

The system now supports **separate paths** for movies and TV shows on each server. This allows proper path mapping when transferring between servers with different directory structures.

## Configuration Format

Edit `backend/src/config/config.json`:

```json
{
  "servers": [
    {
      "id": "server1",
      "name": "Plex Server A",
      "plexUrl": "http://192.168.0.105:32400",
      "plexToken": "YOUR_PLEX_TOKEN",
      "ssh": {
        "host": "192.168.0.105",
        "port": 22,
        "username": "plex",
        "password": "env:PLEX_SERVER1_SSH_PASSWORD"
      },
      "mediaPaths": {
        "movies": "/volume1/media/movies",
        "tv": "/volume1/media/tv",
        "root": "/volume1/media"
      }
    },
    {
      "id": "server2",
      "name": "Plex Server B",
      "plexUrl": "http://192.168.0.106:32400",
      "plexToken": "YOUR_PLEX_TOKEN",
      "ssh": {
        "host": "192.168.0.106",
        "port": 22,
        "username": "plex",
        "password": "env:PLEX_SERVER2_SSH_PASSWORD"
      },
      "mediaPaths": {
        "movies": "/mnt/storage/Movies",
        "tv": "/mnt/storage/TV_Shows",
        "root": "/mnt/storage"
      }
    }
  ]
}
```

## How Path Mapping Works

When transferring files, the system:

1. **Detects the media type** by checking if the source path starts with:
   - `mediaPaths.movies` → Movie file
   - `mediaPaths.tv` → TV show file
   - `mediaPaths.root` → Other media file

2. **Extracts the relative path** from the source base path

3. **Builds the destination path** using the corresponding path type on the destination server

### Example Transfer

**Source (Server A):**
- Path: `/volume1/media/movies/Action/The Matrix (1999)/The Matrix.mkv`
- Detected type: `movies`
- Relative path: `Action/The Matrix (1999)/The Matrix.mkv`

**Destination (Server B):**
- Base path: `/mnt/storage/Movies` (from `mediaPaths.movies`)
- Final path: `/mnt/storage/Movies/Action/The Matrix (1999)/The Matrix.mkv`

### TV Show Example

**Source (Server A):**
- Path: `/volume1/media/tv/Breaking Bad/Season 01/Episode 01.mkv`
- Detected type: `tv`
- Relative path: `Breaking Bad/Season 01/Episode 01.mkv`

**Destination (Server B):**
- Base path: `/mnt/storage/TV_Shows` (from `mediaPaths.tv`)
- Final path: `/mnt/storage/TV_Shows/Breaking Bad/Season 01/Episode 01.mkv`

## Path Validation

The system validates all paths to prevent security issues:
- File browsing is restricted to configured `mediaPaths` only
- Directory traversal attempts are blocked
- All three paths (`movies`, `tv`, `root`) are validated

## Configuration Tips

### 1. Use Absolute Paths
Always use full absolute paths, not relative paths:
```json
✅ "/volume1/media/movies"
❌ "./movies"
❌ "~/media/movies"
```

### 2. No Trailing Slashes
Don't include trailing slashes in paths:
```json
✅ "/volume1/media/movies"
❌ "/volume1/media/movies/"
```

### 3. Case Sensitivity
Paths are case-sensitive on Linux systems:
```json
"/mnt/Movies" ≠ "/mnt/movies"
```

### 4. Root Path as Fallback
The `root` path is used as a fallback for files that don't match `movies` or `tv`:
```json
"mediaPaths": {
  "movies": "/mnt/media/movies",
  "tv": "/mnt/media/tv",
  "root": "/mnt/media"  // Fallback for other files
}
```

## Testing Your Configuration

### 1. Test SSH Connections
```bash
curl -X POST http://localhost:3001/api/servers/server1/test
curl -X POST http://localhost:3001/api/servers/server2/test
```

### 2. List Server Paths
```bash
curl http://localhost:3001/api/servers
```

### 3. Browse Movies Directory
```bash
curl "http://localhost:3001/api/files/server1?path=/volume1/media/movies"
```

### 4. Browse TV Directory
```bash
curl "http://localhost:3001/api/files/server1?path=/volume1/media/tv"
```

## Common Setups

### Synology NAS
```json
"mediaPaths": {
  "movies": "/volume1/video/Movies",
  "tv": "/volume1/video/TV Shows",
  "root": "/volume1/video"
}
```

### QNAP NAS
```json
"mediaPaths": {
  "movies": "/share/Multimedia/Movies",
  "tv": "/share/Multimedia/TV",
  "root": "/share/Multimedia"
}
```

### Ubuntu/Debian Server
```json
"mediaPaths": {
  "movies": "/mnt/media/movies",
  "tv": "/mnt/media/tv",
  "root": "/mnt/media"
}
```

### TrueNAS
```json
"mediaPaths": {
  "movies": "/mnt/pool1/media/movies",
  "tv": "/mnt/pool1/media/tv",
  "root": "/mnt/pool1/media"
}
