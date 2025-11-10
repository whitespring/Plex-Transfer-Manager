import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, RefreshCw, Download, Server, HardDrive, Monitor, Zap, Shield, Globe } from 'lucide-react';
import apiService from '../services/api.js';

function Settings({ darkMode }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generatingNginx, setGeneratingNginx] = useState(false);
  const [nginxConfig, setNginxConfig] = useState('');
  const [activeSection, setActiveSection] = useState('servers');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await apiService.getSettings();
      setConfig(response.config);
    } catch (error) {
      console.error('Failed to load settings:', error);
      alert('Failed to load settings: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await apiService.updateSettings(config);
      setHasChanges(false);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (hasChanges && !confirm('You have unsaved changes. Are you sure you want to reload?')) {
      return;
    }
    await loadSettings();
    setHasChanges(false);
  };

  const handleGenerateNginx = async () => {
    try {
      setGeneratingNginx(true);
      const response = await apiService.generateNginx();
      setNginxConfig(response.nginxConfig);
      alert('nginx.conf generated successfully!');
    } catch (error) {
      console.error('Failed to generate nginx config:', error);
      alert('Failed to generate nginx config: ' + error.message);
    } finally {
      setGeneratingNginx(false);
    }
  };

  const updateConfig = (path, value) => {
    const newConfig = { ...config };
    const keys = path.split('.');
    let current = newConfig;

    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }

    current[keys[keys.length - 1]] = value;
    setConfig(newConfig);
    setHasChanges(true);
  };

  const sections = [
    { id: 'servers', label: 'Servers', icon: Server },
    { id: 'transfer', label: 'Transfer', icon: Zap },
    { id: 'ui', label: 'UI Settings', icon: Monitor },
    { id: 'frontend', label: 'Frontend', icon: Globe },
    { id: 'backend', label: 'Backend', icon: Shield },
    { id: 'nginx', label: 'Nginx', icon: HardDrive },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <SettingsIcon className="h-8 w-8 text-blue-600" />
          <div>
            <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Settings
            </h1>
            <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Configure your Plex Transfer Manager
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleReload}
            className={`inline-flex items-center px-4 py-2 border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
              darkMode
                ? 'border-gray-600 text-gray-300 bg-gray-700 hover:bg-gray-600'
                : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
            }`}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reload
          </button>

          <button
            onClick={handleGenerateNginx}
            disabled={generatingNginx}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
          >
            <Download className="h-4 w-4 mr-2" />
            {generatingNginx ? 'Generating...' : 'Generate Nginx'}
          </button>

          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {hasChanges && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm text-yellow-800">
                You have unsaved changes. Click "Save Changes" to apply them.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-3`}>
              Configuration Sections
            </h3>
            <nav className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon;
                return (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      activeSection === section.id
                        ? `${darkMode ? 'bg-gray-700 text-blue-400' : 'bg-blue-50 text-blue-700'}`
                        : `${darkMode ? 'text-gray-300 hover:bg-gray-700 hover:text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-3" />
                    {section.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-3">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-6`}>
            {/* Servers Section */}
            {activeSection === 'servers' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Server Configuration
                </h2>
                <div className="space-y-6">
                  {config.servers?.map((server, index) => (
                    <div key={server.id} className={`${darkMode ? 'border-gray-600' : 'border-gray-200'} border rounded-lg p-4`}>
                      <h3 className={`text-md font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-3`}>
                        {server.name} ({server.id})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Server Name
                          </label>
                          <input
                            type="text"
                            value={server.name}
                            onChange={(e) => {
                              const newServers = [...config.servers];
                              newServers[index].name = e.target.value;
                              updateConfig('servers', newServers);
                            }}
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Plex URL
                          </label>
                          <input
                            type="text"
                            value={server.plexUrl}
                            onChange={(e) => {
                              const newServers = [...config.servers];
                              newServers[index].plexUrl = e.target.value;
                              updateConfig('servers', newServers);
                            }}
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Host
                          </label>
                          <input
                            type="text"
                            value={server.ssh?.host || ''}
                            onChange={(e) => {
                              const newServers = [...config.servers];
                              if (!newServers[index].ssh) newServers[index].ssh = {};
                              newServers[index].ssh.host = e.target.value;
                              updateConfig('servers', newServers);
                            }}
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            SSH Port
                          </label>
                          <input
                            type="number"
                            value={server.ssh?.port || 22}
                            onChange={(e) => {
                              const newServers = [...config.servers];
                              if (!newServers[index].ssh) newServers[index].ssh = {};
                              newServers[index].ssh.port = parseInt(e.target.value);
                              updateConfig('servers', newServers);
                            }}
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transfer Section */}
            {activeSection === 'transfer' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Transfer Settings
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Max Concurrent Transfers
                    </label>
                    <input
                      type="number"
                      value={config.transfer?.maxConcurrent || 1}
                      onChange={(e) => updateConfig('transfer.maxConcurrent', parseInt(e.target.value))}
                      min="1"
                      max="10"
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Rsync Options
                    </label>
                    <input
                      type="text"
                      value={config.transfer?.rsyncOptions || '-avz --progress --partial'}
                      onChange={(e) => updateConfig('transfer.rsyncOptions', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* UI Section */}
            {activeSection === 'ui' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  UI Settings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Visible Movies
                    </label>
                    <input
                      type="number"
                      value={config.ui?.visibleMovies || 50}
                      onChange={(e) => updateConfig('ui.visibleMovies', parseInt(e.target.value))}
                      min="10"
                      max="200"
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Visible Episodes
                    </label>
                    <input
                      type="number"
                      value={config.ui?.visibleEpisodes || 50}
                      onChange={(e) => updateConfig('ui.visibleEpisodes', parseInt(e.target.value))}
                      min="10"
                      max="200"
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Visible Seasons
                    </label>
                    <input
                      type="number"
                      value={config.ui?.visibleSeasons || 24}
                      onChange={(e) => updateConfig('ui.visibleSeasons', parseInt(e.target.value))}
                      min="5"
                      max="100"
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Frontend Section */}
            {activeSection === 'frontend' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Frontend Settings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Default Source Server
                    </label>
                    <select
                      value={config.frontend?.defaultSourceServer || 'server1'}
                      onChange={(e) => updateConfig('frontend.defaultSourceServer', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white'
                          : 'border-gray-300 bg-white text-gray-900'
                      }`}
                    >
                      {config.servers?.map(server => (
                        <option key={server.id} value={server.id}>{server.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Default Destination Server
                    </label>
                    <select
                      value={config.frontend?.defaultDestServer || 'server2'}
                      onChange={(e) => updateConfig('frontend.defaultDestServer', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white'
                          : 'border-gray-300 bg-white text-gray-900'
                      }`}
                    >
                      {config.servers?.map(server => (
                        <option key={server.id} value={server.id}>{server.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Backend Section */}
            {activeSection === 'backend' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Backend Settings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Port
                    </label>
                    <input
                      type="number"
                      value={config.backend?.port || 3001}
                      onChange={(e) => updateConfig('backend.port', parseInt(e.target.value))}
                      min="1000"
                      max="65535"
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                      Host
                    </label>
                    <input
                      type="text"
                      value={config.backend?.host || '0.0.0.0'}
                      onChange={(e) => updateConfig('backend.host', e.target.value)}
                      className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                        darkMode
                          ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                          : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                      }`}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                    CORS Origins
                  </label>
                  <textarea
                    value={(config.backend?.corsOrigins || []).join('\n')}
                    onChange={(e) => updateConfig('backend.corsOrigins', e.target.value.split('\n').filter(origin => origin.trim()))}
                    rows={4}
                    className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                      darkMode
                        ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                        : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                    }`}
                    placeholder="http://localhost:3000&#10;http://localhost:5173"
                  />
                </div>
              </div>
            )}

            {/* Nginx Section */}
            {activeSection === 'nginx' && (
              <div>
                <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-4`}>
                  Nginx Configuration
                </h2>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Port
                      </label>
                      <input
                        type="number"
                        value={config.nginx?.port || 80}
                        onChange={(e) => updateConfig('nginx.port', parseInt(e.target.value))}
                        min="1"
                        max="65535"
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Server Name
                      </label>
                      <input
                        type="text"
                        value={config.nginx?.serverName || ''}
                        onChange={(e) => updateConfig('nginx.serverName', e.target.value)}
                        placeholder="yourdomain.com"
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Root Directory
                      </label>
                      <input
                        type="text"
                        value={config.nginx?.root || '/var/www/html/plex'}
                        onChange={(e) => updateConfig('nginx.root', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Backend URL
                      </label>
                      <input
                        type="text"
                        value={config.nginx?.backendUrl || 'http://localhost:3001'}
                        onChange={(e) => updateConfig('nginx.backendUrl', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Access Log
                      </label>
                      <input
                        type="text"
                        value={config.nginx?.accessLog || '/var/log/nginx/plextransfer_access.log'}
                        onChange={(e) => updateConfig('nginx.accessLog', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                        Error Log
                      </label>
                      <input
                        type="text"
                        value={config.nginx?.errorLog || '/var/log/nginx/plextransfer_error.log'}
                        onChange={(e) => updateConfig('nginx.errorLog', e.target.value)}
                        className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          darkMode
                            ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                            : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className={`text-md font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      SSL Configuration
                    </h3>
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={config.nginx?.ssl?.enabled || false}
                        onChange={(e) => updateConfig('nginx.ssl.enabled', e.target.checked)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label className={`ml-2 block text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Enable SSL
                      </label>
                    </div>

                    {config.nginx?.ssl?.enabled && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 ml-6">
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            SSL Certificate
                          </label>
                          <input
                            type="text"
                            value={config.nginx?.ssl?.cert || ''}
                            onChange={(e) => updateConfig('nginx.ssl.cert', e.target.value)}
                            placeholder="/etc/ssl/certs/yourdomain.crt"
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                        <div>
                          <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            SSL Key
                          </label>
                          <input
                            type="text"
                            value={config.nginx?.ssl?.key || ''}
                            onChange={(e) => updateConfig('nginx.ssl.key', e.target.value)}
                            placeholder="/etc/ssl/private/yourdomain.key"
                            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                              darkMode
                                ? 'border-gray-600 bg-gray-700 text-white placeholder-gray-400'
                                : 'border-gray-300 bg-white text-gray-900 placeholder-gray-500'
                            }`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Nginx Config Preview */}
      {nginxConfig && (
        <div className="mt-6">
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Generated nginx.conf
              </h3>
              <button
                onClick={() => navigator.clipboard.writeText(nginxConfig)}
                className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Copy to Clipboard
              </button>
            </div>
            <pre className={`text-xs overflow-x-auto p-4 rounded border ${
              darkMode ? 'bg-gray-900 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-800'
            }`}>
              {nginxConfig}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
