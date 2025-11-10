import React, { useState, useEffect } from 'react';
import { Server, ChevronDown } from 'lucide-react';
import apiService from '../services/api.js';

function ServerSelector({ selectedServer, onServerChange, label = "Select Server" }) {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getServers();
      setServers(response.servers || []);
    } catch (err) {
      setError(err.message);
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedServerData = servers.find(server => server.id === selectedServer);

  if (loading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-600">Loading servers...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
        Error loading servers: {error}
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="relative w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
        >
          <div className="flex items-center">
            <Server className="h-5 w-5 text-gray-400 mr-2" />
            <span className="block truncate">
              {selectedServerData ? selectedServerData.name : 'Select a server...'}
            </span>
          </div>
          <ChevronDown className="absolute right-2 top-2.5 h-5 w-5 text-gray-400" />
        </button>

        {isOpen && (
          <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
            {servers.map((server) => (
              <button
                key={server.id}
                type="button"
                onClick={() => {
                  onServerChange(server.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-gray-100 focus:bg-gray-100 focus:outline-none ${
                  selectedServer === server.id ? 'bg-blue-50 text-blue-600' : 'text-gray-900'
                }`}
              >
                <div className="flex items-center">
                  <Server className="h-4 w-4 text-gray-400 mr-2" />
                  <div>
                    <div className="font-medium">{server.name}</div>
                    <div className="text-sm text-gray-500">{server.plexUrl}</div>
                  </div>
                </div>
              </button>
            ))}

            {servers.length === 0 && (
              <div className="px-3 py-2 text-gray-500 text-sm">
                No servers available
              </div>
            )}
          </div>
        )}
      </div>

      {selectedServerData && (
        <div className="mt-2 text-xs text-gray-500">
          IP: {selectedServerData.ssh?.host} | Media paths: {Object.keys(selectedServerData.mediaPaths || {}).join(', ')}
        </div>
      )}
    </div>
  );
}

export default ServerSelector;
