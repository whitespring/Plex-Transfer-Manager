#!/bin/bash

# Plex Transfer Manager Startup Script for macOS
# This script starts both the backend and frontend servers

echo "🚀 Starting Plex Transfer Manager..."

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}Port $port is already in use${NC}"
        return 1
    else
        echo -e "${GREEN}Port $port is available${NC}"
        return 0
    fi
}

# Function to start backend
start_backend() {
    echo -e "${BLUE}Starting backend server...${NC}"

    if [ ! -d "backend" ]; then
        echo -e "${RED}Error: backend directory not found${NC}"
        return 1
    fi

    cd backend

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing backend dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install backend dependencies${NC}"
            cd ..
            return 1
        fi
    fi

    # Check if port 3001 is available
    if ! check_port 3001; then
        echo -e "${YELLOW}Backend port 3001 is in use, attempting to start anyway...${NC}"
    fi

    # Start backend server
    echo -e "${GREEN}Starting backend on port 3001...${NC}"
    npm start &
    BACKEND_PID=$!

    # Wait a moment for backend to start
    sleep 3

    # Check if backend is still running
    if kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${GREEN}Backend started successfully (PID: $BACKEND_PID)${NC}"
        cd ..
        return 0
    else
        echo -e "${RED}Backend failed to start${NC}"
        cd ..
        return 1
    fi
}

# Function to start frontend
start_frontend() {
    echo -e "${BLUE}Starting frontend server...${NC}"

    if [ ! -d "frontend" ]; then
        echo -e "${RED}Error: frontend directory not found${NC}"
        return 1
    fi

    cd frontend

    # Check if node_modules exists
    if [ ! -d "node_modules" ]; then
        echo -e "${YELLOW}Installing frontend dependencies...${NC}"
        npm install
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to install frontend dependencies${NC}"
            cd ..
            return 1
        fi
    fi

    # Start frontend development server
    echo -e "${GREEN}Starting frontend development server...${NC}"
    npm run dev -- --host &
    FRONTEND_PID=$!

    # Wait a moment for frontend to start
    sleep 5

    # Check if frontend is still running
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${GREEN}Frontend started successfully (PID: $FRONTEND_PID)${NC}"
        cd ..
        return 0
    else
        echo -e "${RED}Frontend failed to start${NC}"
        cd ..
        return 1
    fi
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"

    # Kill background processes
    if [ ! -z "$BACKEND_PID" ] && kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping backend (PID: $BACKEND_PID)...${NC}"
        kill $BACKEND_PID 2>/dev/null
    fi

    if [ ! -z "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${BLUE}Stopping frontend (PID: $FRONTEND_PID)...${NC}"
        kill $FRONTEND_PID 2>/dev/null
    fi

    echo -e "${GREEN}Servers stopped.${NC}"
    exit 0
}

# Set up signal handlers for clean shutdown
trap cleanup SIGINT SIGTERM

# Main execution
echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}           Plex Transfer Manager Startup${NC}"
echo -e "${BLUE}============================================================${NC}"

# Check if required tools are installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed. Please install npm first.${NC}"
    exit 1
fi

echo -e "${GREEN}Node.js version: $(node --version)${NC}"
echo -e "${GREEN}npm version: $(npm --version)${NC}"

# Start backend
if start_backend; then
    BACKEND_STARTED=true
else
    echo -e "${RED}Failed to start backend server${NC}"
    exit 1
fi

# Start frontend
if start_frontend; then
    FRONTEND_STARTED=true
else
    echo -e "${RED}Failed to start frontend server${NC}"
    # Don't exit here, backend might still be useful
fi

# Display status
echo -e "\n${BLUE}============================================================${NC}"
echo -e "${GREEN}                 Servers Status${NC}"
echo -e "${BLUE}============================================================${NC}"

if [ "$BACKEND_STARTED" = true ]; then
    echo -e "${GREEN}✓ Backend server running on http://localhost:3001${NC}"
else
    echo -e "${RED}✗ Backend server failed to start${NC}"
fi

if [ "$FRONTEND_STARTED" = true ]; then
    echo -e "${GREEN}✓ Frontend server running (check output above for URL)${NC}"
else
    echo -e "${RED}✗ Frontend server failed to start${NC}"
fi

echo -e "\n${YELLOW}Press Ctrl+C to stop all servers${NC}"

# Wait for user interrupt
wait
