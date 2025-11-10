# SSH Setup Guide

This guide will help you set up SSH connections between your Plex servers to enable direct file transfers.

## Overview

The Plex Transfer Manager uses SSH to:
1. **Backend → Plex Servers**: Browse files and initiate transfers (password auth)
2. **Plex Server A → Plex Server B**: Direct file transfers using rsync (key-based auth)

## Architecture

```
Backend (LXC 101)
    ↓ SSH (password)
Plex Server A (105)
    ↓ SSH (key-based)
Plex Server B (XXX)
```

## Step 1: Set Up SSH Server on Backend (LXC 101)

On your backend LXC container:

```bash
# Install SSH server if not already installed
sudo apt update
sudo apt install openssh-server rsync

# Start SSH service
sudo systemctl start ssh
sudo systemctl enable ssh

# Verify SSH is running
sudo systemctl status ssh
```

## Step 2: Set Up SSH Keys on Plex Server A

On **Plex Server A (192.168.0.105)**:

```bash
# Generate SSH key pair (press Enter for all prompts to use defaults)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""

# This creates:
# - Private key: ~/.ssh/id_rsa
# - Public key: ~/.ssh/id_rsa.pub
```

## Step 3: Copy SSH Key to Plex Server B

Still on **Plex Server A**:

```bash
# Copy public key to Server B
# You'll be asked for Server B's password once
ssh-copy-id username@192.168.0.XXX

# Test the connection (should NOT ask for password)
ssh username@192.168.0.XXX "echo SSH connection successful"
```

If successful, you should see "SSH connection successful" without entering a password.

## Step 4: Configure Backend Environment Variables

On your **development machine**, create the `.env` file:

```bash
cd /path/to/Plex_Transfer_Manager/backend
cp .env.example .env
```

Edit `.env` and add your SSH passwords:

```env
PLEX_SERVER1_SSH_PASSWORD=your_actual_password_for_server_105
PLEX_SERVER2_SSH_PASSWORD=your_actual_password_for_server_XXX
```

**IMPORTANT**: Never commit the `.env` file to version control!

## Step 5: Update Configuration

Edit `backend/src/config/config.json`:

1. Replace `YOUR_PLEX_TOKEN_HERE` with your actual Plex tokens
2. Update server IP addresses
3. Set correct media paths for each server

Example:

```json
{
  "servers": [
    {
      "id": "server1",
      "name": "Plex Server A",
      "plexUrl": "http://192.168.0.105:32400",
      "plexToken": "BzimUQGX-6kKAtYF16dC",
      "ssh": {
        "host": "192.168.0.105",
        "port": 22,
        "username": "plex",
        "password": "env:PLEX_SERVER1_SSH_PASSWORD"
      },
      "mediaPath": "/mnt/media/plex"
    }
  ]
}
```

## Step 6: Verify Setup

### Test Backend → Server A Connection

```bash
# From backend container
ssh plex@192.168.0.105 "ls -la"
```

### Test Server A → Server B Connection

```bash
# From Server A
ssh username@192.168.0.XXX "ls -la"
```

### Test rsync Transfer

```bash
# From Server A, test a small file transfer
touch /tmp/test.txt
rsync -avz --progress /tmp/test.txt username@192.168.0.XXX:/tmp/
```

## Troubleshooting

### Permission Denied (publickey)

If you get this error:
```bash
# On Server B, check SSH config
sudo nano /etc/ssh/sshd_config

# Ensure these settings:
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys

# Restart SSH
sudo systemctl restart ssh
```

### SSH Key Not Working

```bash
# On Server A, check permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_rsa
chmod 644 ~/.ssh/id_rsa.pub

# On Server B, check authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Connection Timeout

- Verify servers can ping each other
- Check firewall rules (port 22 must be open)
- Verify correct IP addresses

## Security Best Practices

1. **Use SSH Keys**: Never store passwords in code
2. **Restrict SSH Access**: Use firewall rules to limit SSH access to known IPs
3. **Regular Updates**: Keep SSH server updated
4. **Monitor Logs**: Check `/var/log/auth.log` for suspicious activity
5. **Disable Root Login**: In `/etc/ssh/sshd_config` set `PermitRootLogin no`

## File Permissions Required

The SSH user must have:
- **Read** permission on source files
- **Write** permission on destination directory
- **Execute** permission on all parent directories

## Next Steps

Once SSH is set up:
1. Start the backend server: `npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Test file browsing in the web interface
4. Try a small test transfer

## Additional Notes

### Bidirectional Transfers

If you want to transfer files in both directions:
1. Repeat Steps 2-3 but from Server B to Server A
2. This gives you full bidirectional capability

### Multiple Source Servers

For more than 2 servers:
- Set up SSH keys from each server to every other server
- Update `config.json` with additional server entries
- Update `.env` with additional SSH passwords
