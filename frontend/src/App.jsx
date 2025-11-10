import React, { useState, useEffect } from 'react';
import { Server, FileText, Download, Search, Clock, CheckCircle, XCircle, Moon, Sun } from 'lucide-react';
import DuplicateFinder from './components/DuplicateFinder.jsx';
import RecentlyAdded from './components/RecentlyAdded.jsx';
import ServerSelector from './components/ServerSelector.jsx';
import Settings from './components/Settings.jsx';
import apiService from './services/api.js';
import websocketService from './services/websocket.js';

function App() {
  const [backendStatus, setBackendStatus] = useState('checking');
  const [servers, setServers] = useState([]);
  const [serverDetails, setServerDetails] = useState({});
  const [uiConfig, setUIConfig] = useState({
    visibleMovies: 36,
    visibleEpisodes: 36,
    visibleSeasons: 24
  });
  const [frontendConfig, setFrontendConfig] = useState({
    defaultSourceServer: "server1",
    defaultDestServer: "server2"
  });
  const [recentMovies, setRecentMovies] = useState([]);
  const [selectedMovies, setSelectedMovies] = useState(new Set());
  const [visibleMovies, setVisibleMovies] = useState(36);
  const [recentEpisodes, setRecentEpisodes] = useState([]);
  const [selectedEpisodes, setSelectedEpisodes] = useState(new Set());
  const [visibleEpisodes, setVisibleEpisodes] = useState(36);
  const [recentSeasons, setRecentSeasons] = useState([]);
  const [selectedSeasons, setSelectedSeasons] = useState(new Set());
  const [visibleSeasons, setVisibleSeasons] = useState(24);
  const [tvViewMode, setTvViewMode] = useState('seasons'); // 'episodes' or 'seasons'
  const [darkMode, setDarkMode] = useState(true); // Dark mode toggle
  const [selectedServer, setSelectedServer] = useState(null); // Will be set from config
  const [activeTab, setActiveTab] = useState('movies'); // 'movies', 'tv', 'search', or 'settings'
  const [activeTransfers, setActiveTransfers] = useState(new Map());
  const [transferHistory, setTransferHistory] = useState([]);
  const [currentBatch, setCurrentBatch] = useState({ total: 0, completed: 0, size: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedSearchResults, setSelectedSearchResults] = useState(new Set());

  useEffect(() => {
    checkBackendStatus();
    websocketService.connect();

    // WebSocket event listeners for transfer progress
    websocketService.on('transfer:update', (transfer) => {
      console.log('📡 Transfer update:', transfer);
      setActiveTransfers(prev => {
        const newMap = new Map(prev);
        newMap.set(transfer.id, transfer);

        // Check if all transfers are complete (including skipped)
        const allTransfers = Array.from(newMap.values());
        const allComplete = allTransfers.every(t =>
          t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
        );

        if (allComplete) {
          // Move all completed transfers to history
          const completedTransfers = allTransfers.filter(t =>
            t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
          );
          setTransferHistory(prev => [...completedTransfers, ...prev.slice(0, 9)]); // Keep last 10

          // Update file existence status for successfully transferred files
          console.log('🔄 Updating file existence status after transfer completion');
          updateTransferredFilesExistence(completedTransfers.filter(t => t.status === 'completed')).catch(error => {
            console.error('❌ Failed to update file existence status:', error);
            // Don't show alert for this error as it's not critical to the transfer process
          });

          // Clear active transfers
          return new Map();
        }

        return newMap;
      });
    });

    // WebSocket reconnection handler
    websocketService.on('reconnect', () => {
      console.log('🔄 WebSocket reconnected, refreshing transfer status...');
      // When WebSocket reconnects, refresh the current view to ensure status is up to date
      if (backendStatus === 'connected' && selectedServer) {
        loadRecentMovies(selectedServer);
        loadRecentEpisodes(selectedServer).then(() => {
          loadRecentSeasons(selectedServer);
        });
      }
    });

    websocketService.on('transfer:progress', (data) => {
      console.log('📊 Transfer progress:', data);
      setActiveTransfers(prev => {
        const newMap = new Map(prev);
        const transfer = newMap.get(data.id);
        if (transfer) {
          transfer.progress = data.progress;
          newMap.set(data.id, transfer);
        }
        return newMap;
      });
    });

    websocketService.on('transfer:complete', (data) => {
      console.log('✅ Transfer complete:', data);
      // Transfer will be moved to history by the update event
    });

    websocketService.on('transfer:error', (data) => {
      console.log('❌ Transfer error:', data);
      // Transfer will be updated by the update event
    });

    return () => {
      websocketService.off('transfer:update');
      websocketService.off('transfer:progress');
      websocketService.off('transfer:complete');
      websocketService.off('transfer:error');
    };
  }, []);

  useEffect(() => {
    if (backendStatus === 'connected' && servers.length > 0) {
      // Set default server from config if not set
      if (!selectedServer && frontendConfig.defaultSourceServer) {
        setSelectedServer(frontendConfig.defaultSourceServer);
      }

      // Load details for all servers
      servers.forEach(server => {
        loadServerDetails(server.id);
      });
    }
  }, [backendStatus, servers, frontendConfig, selectedServer]);

  useEffect(() => {
    if (backendStatus === 'connected' && servers.length > 0 && selectedServer) {
      // Load recent content for selected server - episodes first, then seasons
      loadRecentMovies(selectedServer);
      loadRecentEpisodes(selectedServer).then(() => {
        // Load seasons after episodes are loaded
        loadRecentSeasons(selectedServer);
      });
    }
  }, [backendStatus, servers, selectedServer]);

  const checkBackendStatus = async () => {
    console.log('🚀 checkBackendStatus called');
    try {
      console.log('🔍 Checking backend status...');
      const health = await apiService.getHealth();
      console.log('✅ Backend health check passed');
      setBackendStatus('connected');

      // Load servers, UI config, and frontend config in parallel
      console.log('📡 Loading servers, UI config, and frontend config...');
      const [serversResponse, uiConfigResponse, frontendConfigResponse] = await Promise.all([
        apiService.getServers(),
        apiService.getUIConfig().catch((error) => {
          console.error('❌ UI config API failed, using defaults:', error);
          return { ui: { visibleMovies: 36, visibleEpisodes: 36, visibleSeasons: 24 } };
        }),
        apiService.getFrontendConfig().catch((error) => {
          console.error('❌ Frontend config API failed, using defaults:', error);
          return { frontend: { defaultSourceServer: "server1", defaultDestServer: "server2" } };
        })
      ]);

      console.log('📊 Servers response:', serversResponse);
      console.log('⚙️ UI config response:', uiConfigResponse);
      console.log('🔧 Frontend config response:', frontendConfigResponse);

      setServers(serversResponse.servers || []);
      setUIConfig(uiConfigResponse.ui);
      setFrontendConfig(frontendConfigResponse.frontend);

      // Update visible counts based on config
      console.log('🔢 Setting visible counts:', {
        visibleMovies: uiConfigResponse.ui.visibleMovies,
        visibleEpisodes: uiConfigResponse.ui.visibleEpisodes,
        visibleSeasons: uiConfigResponse.ui.visibleSeasons
      });
      setVisibleMovies(uiConfigResponse.ui.visibleMovies);
      setVisibleEpisodes(uiConfigResponse.ui.visibleEpisodes);
      setVisibleSeasons(uiConfigResponse.ui.visibleSeasons);

    } catch (error) {
      console.error('❌ Backend connection failed:', error);
      setBackendStatus('disconnected');
    }
  };

  const loadServerDetails = async (serverId) => {
    try {
      const [infoResponse, diskResponse] = await Promise.all([
        apiService.getServerInfo(serverId).catch(() => ({ server: null })),
        apiService.getServerDisk(serverId).catch(() => ({ disks: [] }))
      ]);

      setServerDetails(prev => ({
        ...prev,
        [serverId]: {
          info: infoResponse.server,
          disk: diskResponse.disks || []
        }
      }));
    } catch (error) {
      console.error('Failed to load server details:', error);
    }
  };

  const loadRecentMovies = async (serverId) => {
    try {
      console.log('🎬 Loading recent movies for server:', serverId);
      const movies = await apiService.getRecentMovies(serverId, 50); // Load more movies for pagination
      console.log('📽️ Received', movies.length, 'movies from API');

      // Check which movies already exist on destination server (server2)
      const moviesWithExistence = await Promise.all(
        movies.map(async (movie) => {
          try {
            // Map the source path to destination path for checking
            const sourcePath = movie.filePath;
            const destPath = mapPathToDestination(sourcePath);
            const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
            return {
              ...movie,
              existsOnDestination: existenceCheck.exists,
              destinationPath: destPath
            };
          } catch (error) {
            console.error('Error checking movie existence:', error);
            return {
              ...movie,
              existsOnDestination: false,
              destinationPath: null
            };
          }
        })
      );

      console.log('✅ Processed movies with existence checks');
      setRecentMovies(moviesWithExistence);
      setSelectedMovies(new Set()); // Reset selection when loading new movies

      const newVisibleCount = uiConfig.visibleMovies;
      console.log('🔢 Setting visibleMovies to:', newVisibleCount, '(from uiConfig)');
      setVisibleMovies(newVisibleCount); // Reset visible count
    } catch (error) {
      console.error('❌ Failed to load recent movies:', error);
      setRecentMovies([]);
    }
  };

  const loadRecentEpisodes = async (serverId) => {
    try {
      const episodes = await apiService.getRecentEpisodes(serverId, 50); // Load more episodes for pagination

      // Check which episodes already exist on destination server (server2)
      const episodesWithExistence = await Promise.all(
        episodes.map(async (episode) => {
          try {
            // Map the source path to destination path for checking
            const sourcePath = episode.filePath;
            const destPath = mapPathToDestination(sourcePath);
            const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
            return {
              ...episode,
              existsOnDestination: existenceCheck.exists,
              destinationPath: destPath
            };
          } catch (error) {
            console.error('Error checking episode existence:', error);
            return {
              ...episode,
              existsOnDestination: false,
              destinationPath: null
            };
          }
        })
      );

      setRecentEpisodes(episodesWithExistence);
      setSelectedEpisodes(new Set()); // Reset selection when loading new episodes
      setVisibleEpisodes(uiConfig.visibleEpisodes); // Reset visible count
    } catch (error) {
      console.error('Failed to load recent episodes:', error);
      setRecentEpisodes([]);
    }
  };

  const mapPathToDestination = (sourcePath, sourceServerId = selectedServer, destServerId = frontendConfig.defaultDestServer) => {
    const sourceServer = servers.find(s => s.id === sourceServerId);
    const destServer = servers.find(s => s.id === destServerId);

    if (!sourceServer || !destServer) {
      console.warn('Server not found for path mapping');
      return sourcePath;
    }

    // Determine media type and get relative path
    let relativePath;
    let mediaType;

    // Check if path is in movies directory
    if (sourceServer.mediaPaths?.movies && sourcePath.startsWith(sourceServer.mediaPaths.movies)) {
      relativePath = sourcePath.replace(sourceServer.mediaPaths.movies, '').replace(/^\/+/, '');
      mediaType = 'movies';
    }
    // Check if path is in TV directory
    else if (sourceServer.mediaPaths?.tv && sourcePath.startsWith(sourceServer.mediaPaths.tv)) {
      relativePath = sourcePath.replace(sourceServer.mediaPaths.tv, '').replace(/^\/+/, '');
      mediaType = 'tv';
    }
    // Fallback to root path
    else if (sourceServer.mediaPaths?.root && sourcePath.startsWith(sourceServer.mediaPaths.root)) {
      relativePath = sourcePath.replace(sourceServer.mediaPaths.root, '').replace(/^\/+/, '');
      mediaType = 'root';
    }
    // If no match, just use the filename
    else {
      const parts = sourcePath.split('/');
      relativePath = parts[parts.length - 1];
      mediaType = 'root';
    }

    // Build destination path based on media type
    let destBasePath;
    if (mediaType === 'movies' && destServer.mediaPaths?.movies) {
      destBasePath = destServer.mediaPaths.movies;
    } else if (mediaType === 'tv' && destServer.mediaPaths?.tv) {
      destBasePath = destServer.mediaPaths.tv;
    } else {
      destBasePath = destServer.mediaPaths?.root || destServer.mediaPaths?.movies || destServer.mediaPaths?.tv;
    }

    return `${destBasePath}/${relativePath}`.replace(/\/+/g, '/');
  };

  const toggleMovieSelection = (movieId) => {
    const newSelection = new Set(selectedMovies);
    if (newSelection.has(movieId)) {
      newSelection.delete(movieId);
    } else {
      newSelection.add(movieId);
    }
    setSelectedMovies(newSelection);
  };

  const toggleEpisodeSelection = (episodeId) => {
    const newSelection = new Set(selectedEpisodes);
    if (newSelection.has(episodeId)) {
      newSelection.delete(episodeId);
    } else {
      newSelection.add(episodeId);
    }
    setSelectedEpisodes(newSelection);
  };

  const loadMoreMovies = () => {
    setVisibleMovies(prev => prev + 18);
  };

  const loadMoreEpisodes = () => {
    setVisibleEpisodes(prev => prev + 18);
  };

  const loadRecentSeasons = async (serverId) => {
    try {
      const seasons = await apiService.getRecentSeasons(serverId, 20);

      // For seasons, we need to check if ALL episodes in the season exist on destination
      // A season is "complete" only if all its episodes exist
      // Check episodes sequentially to avoid SSH connection overload
      const seasonsWithExistence = [];
      for (const season of seasons) {
        try {
          console.log(`Checking existence for season: ${season.showTitle} S${season.seasonNumber} (${season.episodes.length} episodes)`);

          // Check each episode in the season sequentially
          const episodeChecks = [];
          for (const episode of season.episodes) {
            try {
              const sourcePath = episode.filePath;
              const destPath = mapPathToDestination(sourcePath);
              const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
              episodeChecks.push(existenceCheck.exists);
            } catch (error) {
              console.error(`Error checking episode existence: ${episode.title}`, error);
              episodeChecks.push(false); // Default to not exists on error
            }
          }

          // Season exists if ALL episodes exist
          const allEpisodesExist = episodeChecks.every(exists => exists);
          const someEpisodesExist = episodeChecks.some(exists => exists);

          seasonsWithExistence.push({
            ...season,
            existsOnDestination: allEpisodesExist,
            partiallyExists: someEpisodesExist && !allEpisodesExist
          });

          console.log(`Season ${season.showTitle} S${season.seasonNumber}: ${episodeChecks.filter(e => e).length}/${episodeChecks.length} episodes exist`);

        } catch (error) {
          console.error('Error checking season existence:', error);
          seasonsWithExistence.push({
            ...season,
            existsOnDestination: false,
            partiallyExists: false
          });
        }
      }

      setRecentSeasons(seasonsWithExistence);
      setSelectedSeasons(new Set()); // Reset selection when loading new seasons
      setVisibleSeasons(uiConfig.visibleSeasons); // Reset visible count
    } catch (error) {
      console.error('Failed to load recent seasons:', error);
      setRecentSeasons([]);
    }
  };

  const toggleSeasonSelection = (seasonId) => {
    const newSelection = new Set(selectedSeasons);
    if (newSelection.has(seasonId)) {
      newSelection.delete(seasonId);
    } else {
      newSelection.add(seasonId);
    }
    setSelectedSeasons(newSelection);
  };

  const loadMoreSeasons = () => {
    setVisibleSeasons(prev => prev + 12);
  };

  const getMoviePosterUrl = (movie) => {
    if (movie.thumb) {
      // Use the backend proxy to avoid CORS issues
      return apiService.getMoviePosterUrl(selectedServer, movie.thumb);
    }
    return null;
  };

  const getEpisodePosterUrl = (episode) => {
    if (episode.art) {
      // Use the backend proxy to avoid CORS issues
      // For episodes, use the show's poster (art) instead of episode poster (thumb)
      return apiService.getMoviePosterUrl(selectedServer, episode.art);
    }
    return null;
  };

  const handleTransferMovies = async () => {
    console.log('🔄 Transfer movies button clicked');
    console.log('Selected movies count:', selectedMovies.size);
    console.log('Selected movie IDs:', Array.from(selectedMovies));

    if (selectedMovies.size === 0) {
      console.log('❌ No movies selected, returning early');
      return;
    }

    try {
      // Get selected movie objects
      const selectedMovieObjects = recentMovies.filter(movie => selectedMovies.has(movie.id));
      console.log('Selected movie objects:', selectedMovieObjects);

      // Filter out movies that already exist on destination
      const filesToTransfer = [];
      let skippedCount = 0;
      let errorCount = 0;

      for (const movie of selectedMovieObjects) {
        try {
          const destPath = mapPathToDestination(movie.filePath);
          console.log(`🔍 Checking existence: ${destPath}`);
          const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
          console.log(`📁 ${movie.title}: exists = ${existenceCheck.exists}`);

          if (!existenceCheck.exists) {
            filesToTransfer.push({
              path: movie.filePath,
              name: movie.title,
              size: movie.fileSize || 0
            });
          } else {
            console.log(`⏭️ Skipping existing movie: ${movie.title}`);
            skippedCount++;
          }
        } catch (error) {
          console.error(`❌ Error checking existence for ${movie.title}:`, error);
          // Exclude from transfer if we can't check existence (safer approach)
          console.log(`⚠️ Excluding ${movie.title} from transfer due to check failure`);
          errorCount++;
        }
      }

      if (filesToTransfer.length === 0) {
        alert('All selected movies already exist on the destination server.');
        setSelectedMovies(new Set());
        return;
      }

      // Show feedback about skipped files
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} existing movie(s), transferring ${filesToTransfer.length} file(s)`);
      }

      // Create transfer
      const transferData = {
        sourceServerId: frontendConfig.defaultSourceServer,
        destServerId: frontendConfig.defaultDestServer,
        files: filesToTransfer
      };

      console.log('📤 Creating transfer:', transferData);
      const response = await apiService.createTransfer(transferData);
      console.log('✅ Transfer API response:', response);

      // Clear selection after transfer
      setSelectedMovies(new Set());

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      alert(`Transfer failed: ${error.message}`);
    }
  };

  const handleTransferEpisodes = async () => {
    console.log('🔄 Transfer episodes button clicked');
    console.log('Selected episodes count:', selectedEpisodes.size);
    console.log('Selected episode IDs:', Array.from(selectedEpisodes));

    if (selectedEpisodes.size === 0) {
      console.log('❌ No episodes selected, returning early');
      return;
    }

    try {
      // Get selected episode objects
      const selectedEpisodeObjects = recentEpisodes.filter(episode => selectedEpisodes.has(episode.id));
      console.log('Selected episode objects:', selectedEpisodeObjects);

      // Filter out episodes that already exist on destination
      const filesToTransfer = [];
      let skippedCount = 0;
      let errorCount = 0;

      for (const episode of selectedEpisodeObjects) {
        try {
          const destPath = mapPathToDestination(episode.filePath);
          console.log(`🔍 Checking existence: ${destPath}`);
          const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
          console.log(`📁 ${episode.title}: exists = ${existenceCheck.exists}`);

          if (!existenceCheck.exists) {
            filesToTransfer.push({
              path: episode.filePath,
              name: episode.title,
              size: episode.fileSize || 0
            });
          } else {
            console.log(`⏭️ Skipping existing episode: ${episode.title}`);
            skippedCount++;
          }
        } catch (error) {
          console.error(`❌ Error checking existence for ${episode.title}:`, error);
          // Exclude from transfer if we can't check existence (safer approach)
          console.log(`⚠️ Excluding ${episode.title} from transfer due to check failure`);
          errorCount++;
        }
      }

      if (filesToTransfer.length === 0) {
        alert('All selected episodes already exist on the destination server.');
        setSelectedEpisodes(new Set());
        return;
      }

      // Show feedback about skipped files
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} existing episode(s), transferring ${filesToTransfer.length} file(s)`);
      }

      // Create transfer
      const transferData = {
        sourceServerId: frontendConfig.defaultSourceServer,
        destServerId: frontendConfig.defaultDestServer,
        files: filesToTransfer
      };

      console.log('📤 Creating transfer:', transferData);
      const response = await apiService.createTransfer(transferData);
      console.log('✅ Transfer API response:', response);

      // Clear selection after transfer
      setSelectedEpisodes(new Set());

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      alert(`Transfer failed: ${error.message}`);
    }
  };

  const handleTransferSeasons = async () => {
    console.log('🔄 Transfer seasons button clicked');
    console.log('Selected seasons count:', selectedSeasons.size);
    console.log('Selected season IDs:', Array.from(selectedSeasons));

    if (selectedSeasons.size === 0) {
      console.log('❌ No seasons selected, returning early');
      return;
    }

    try {
      // Get selected season objects
      const selectedSeasonObjects = recentSeasons.filter(season => selectedSeasons.has(season.id));
      console.log('Selected season objects:', selectedSeasonObjects);

      // Collect all episodes from selected seasons and filter out existing ones
      const filesToTransfer = [];
      let totalSkipped = 0;
      let totalErrorCount = 0;

      for (const season of selectedSeasonObjects) {
        console.log(`Processing season: ${season.showTitle} S${season.seasonNumber} (${season.episodes.length} episodes)`);

        for (const episode of season.episodes) {
          try {
            const destPath = mapPathToDestination(episode.filePath);
            console.log(`🔍 Checking existence: ${destPath}`);
            const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
            console.log(`📁 ${episode.title}: exists = ${existenceCheck.exists}`);

            if (!existenceCheck.exists) {
              filesToTransfer.push({
                path: episode.filePath,
                name: episode.title,
                size: episode.fileSize || 0
              });
            } else {
              console.log(`⏭️ Skipping existing episode: ${episode.title}`);
              totalSkipped++;
            }
          } catch (error) {
            console.error(`❌ Error checking existence for ${episode.title}:`, error);
            // Exclude from transfer if we can't check existence (safer approach)
            console.log(`⚠️ Excluding ${episode.title} from transfer due to check failure`);
            totalErrorCount++;
          }
        }
      }

      if (filesToTransfer.length === 0) {
        alert('All episodes from selected seasons already exist on the destination server.');
        setSelectedSeasons(new Set());
        return;
      }

      // Show feedback about skipped files
      if (totalSkipped > 0) {
        console.log(`ℹ️ Skipped ${totalSkipped} existing episode(s), transferring ${filesToTransfer.length} file(s)`);
      }

      // Create transfer
      const transferData = {
        sourceServerId: frontendConfig.defaultSourceServer,
        destServerId: frontendConfig.defaultDestServer,
        files: filesToTransfer
      };

      console.log('📤 Creating season transfer:', transferData);
      const response = await apiService.createTransfer(transferData);
      console.log('✅ Transfer API response:', response);

      // Clear selection after transfer
      setSelectedSeasons(new Set());

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      alert(`Transfer failed: ${error.message}`);
    }
  };

  const updateTransferredFilesExistence = async (completedTransfers) => {
    console.log('🔄 Updating existence status for completed transfers:', completedTransfers.length);

    if (completedTransfers.length === 0) {
      console.log('ℹ️ No completed transfers to update');
      return;
    }

    // Instead of trying to match paths, re-check file existence for all currently displayed items
    // This ensures accuracy and uses the same reliable method as initial load
    console.log('🔄 Re-checking file existence for all displayed items after transfers');

    try {
      // Update movies if we're on the movies tab
      if (activeTab === 'movies' && recentMovies.length > 0) {
        console.log('🎬 Re-checking movie existence status');
        const moviesWithUpdatedExistence = await Promise.all(
          recentMovies.map(async (movie) => {
            try {
              const destPath = mapPathToDestination(movie.filePath);
              const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
              return {
                ...movie,
                existsOnDestination: existenceCheck.exists,
                destinationPath: destPath
              };
            } catch (error) {
              console.error('Error re-checking movie existence:', error);
              return movie; // Keep existing status on error
            }
          })
        );
        setRecentMovies(moviesWithUpdatedExistence);
        console.log('✅ Movie existence status updated');
      }

      // Update episodes if we're on the TV tab
      if (activeTab === 'tv' && recentEpisodes.length > 0) {
        console.log('📺 Re-checking episode existence status');
        const episodesWithUpdatedExistence = await Promise.all(
          recentEpisodes.map(async (episode) => {
            try {
              const destPath = mapPathToDestination(episode.filePath);
              const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
              return {
                ...episode,
                existsOnDestination: existenceCheck.exists,
                destinationPath: destPath
              };
            } catch (error) {
              console.error('Error re-checking episode existence:', error);
              return episode; // Keep existing status on error
            }
          })
        );
        setRecentEpisodes(episodesWithUpdatedExistence);
        console.log('✅ Episode existence status updated');

        // Also update seasons based on the updated episode data
        if (recentSeasons.length > 0) {
          console.log('📊 Re-checking season completeness');
          const seasonsWithUpdatedStatus = await Promise.all(
            recentSeasons.map(async (season) => {
              try {
                // Check each episode in the season
                const episodeChecks = await Promise.all(
                  season.episodes.map(async (episode) => {
                    const destPath = mapPathToDestination(episode.filePath);
                    const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
                    return existenceCheck.exists;
                  })
                );

                const allEpisodesExist = episodeChecks.every(exists => exists);
                const someEpisodesExist = episodeChecks.some(exists => exists);

                return {
                  ...season,
                  existsOnDestination: allEpisodesExist,
                  partiallyExists: someEpisodesExist && !allEpisodesExist
                };
              } catch (error) {
                console.error('Error re-checking season status:', error);
                return season; // Keep existing status on error
              }
            })
          );
          setRecentSeasons(seasonsWithUpdatedStatus);
          console.log('✅ Season status updated');
        }
      }

      console.log('✅ File existence status updated after transfers');
    } catch (error) {
      console.error('❌ Failed to update file existence status:', error);
      // Don't show alert for this error as it's not critical to the transfer process
    }
  };

  const performSearch = async (query) => {
    if (!query.trim() || !selectedServer) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      console.log(`🔍 Searching for "${query}" on server ${selectedServer}`);
      const results = await apiService.searchContent(selectedServer, query.trim());

      // Check which search results already exist on destination server
      const resultsWithExistence = await Promise.all(
        results.map(async (item) => {
          try {
            const destPath = mapPathToDestination(item.filePath);
            const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
            return {
              ...item,
              existsOnDestination: existenceCheck.exists,
              destinationPath: destPath
            };
          } catch (error) {
            console.error('Error checking search result existence:', error);
            return {
              ...item,
              existsOnDestination: false,
              destinationPath: null
            };
          }
        })
      );

      console.log(`✅ Found ${resultsWithExistence.length} search results`);
      setSearchResults(resultsWithExistence);
    } catch (error) {
      console.error('❌ Search failed:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const toggleSearchResultSelection = (resultId) => {
    const newSelection = new Set(selectedSearchResults);
    if (newSelection.has(resultId)) {
      newSelection.delete(resultId);
    } else {
      newSelection.add(resultId);
    }
    setSelectedSearchResults(newSelection);
  };

  const handleTransferSearchResults = async () => {
    console.log('🔄 Transfer search results button clicked');
    console.log('Selected search results count:', selectedSearchResults.size);

    if (selectedSearchResults.size === 0) {
      console.log('❌ No search results selected, returning early');
      return;
    }

    try {
      // Get selected search result objects
      const selectedResultObjects = searchResults.filter(result => selectedSearchResults.has(result.id));
      console.log('Selected search result objects:', selectedResultObjects);

      // Filter out results that already exist on destination
      const filesToTransfer = [];
      let skippedCount = 0;
      let errorCount = 0;

      for (const result of selectedResultObjects) {
        try {
          const destPath = mapPathToDestination(result.filePath);
          console.log(`🔍 Checking existence: ${destPath}`);
          const existenceCheck = await apiService.checkFileExists(frontendConfig.defaultDestServer, destPath);
          console.log(`📁 ${result.title}: exists = ${existenceCheck.exists}`);

          if (!existenceCheck.exists) {
            filesToTransfer.push({
              path: result.filePath,
              name: result.title,
              size: result.fileSize || 0
            });
          } else {
            console.log(`⏭️ Skipping existing result: ${result.title}`);
            skippedCount++;
          }
        } catch (error) {
          console.error(`❌ Error checking existence for ${result.title}:`, error);
          // Exclude from transfer if we can't check existence (safer approach)
          console.log(`⚠️ Excluding ${result.title} from transfer due to check failure`);
          errorCount++;
        }
      }

      if (filesToTransfer.length === 0) {
        alert('All selected search results already exist on the destination server.');
        setSelectedSearchResults(new Set());
        return;
      }

      // Show feedback about skipped files
      if (skippedCount > 0) {
        console.log(`ℹ️ Skipped ${skippedCount} existing result(s), transferring ${filesToTransfer.length} file(s)`);
      }

      // Create transfer
      const transferData = {
        sourceServerId: frontendConfig.defaultSourceServer,
        destServerId: frontendConfig.defaultDestServer,
        files: filesToTransfer
      };

      console.log('📤 Creating search results transfer:', transferData);
      const response = await apiService.createTransfer(transferData);
      console.log('✅ Transfer API response:', response);

      // Clear selection after transfer
      setSelectedSearchResults(new Set());

    } catch (error) {
      console.error('❌ Transfer failed:', error);
      alert(`Transfer failed: ${error.message}`);
    }
  };

  const handleCancelAllTransfers = async () => {
    if (activeTransfers.size === 0) return;

    // Immediate UI feedback - mark transfers as cancelled
    setActiveTransfers(prev => {
      const newMap = new Map(prev);
      for (const [id, transfer] of newMap.entries()) {
        if (transfer.status === 'active' || transfer.status === 'queued') {
          transfer.status = 'cancelled';
          transfer.error = 'Cancelled by user';
          newMap.set(id, transfer);
        }
      }
      return newMap;
    });

    try {
      console.log('🛑 Cancelling all transfers');

      // Cancel all active transfers
      const cancelPromises = Array.from(activeTransfers.keys()).map(async (transferId) => {
        try {
          await apiService.cancelTransfer(transferId);
          console.log(`✅ Cancelled transfer ${transferId}`);
        } catch (error) {
          console.error(`❌ Failed to cancel transfer ${transferId}:`, error);
        }
      });

      await Promise.all(cancelPromises);
      console.log('✅ All cancel requests sent');

    } catch (error) {
      console.error('❌ Error cancelling transfers:', error);
      // Don't show alert for cancel errors as UI already shows cancelled state
    }
  };

  const renderContent = () => (
    <div className={`min-h-screen ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Top Bar with Transfer Button */}
      <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border-b px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Server className="h-6 w-6 text-blue-600" />
            <h1 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Plex Transfer Manager</h1>
          </div>

          <div className="flex items-center space-x-3">
            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`inline-flex items-center px-3 py-2 border rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                darkMode
                  ? 'border-gray-600 text-gray-300 bg-gray-700 hover:bg-gray-600'
                  : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
              }`}
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {/* Transfer Button */}
            <button
              onClick={
                activeTab === 'movies'
                  ? handleTransferMovies
                  : activeTab === 'tv' && tvViewMode === 'seasons'
                  ? handleTransferSeasons
                  : activeTab === 'tv'
                  ? handleTransferEpisodes
                  : handleTransferSearchResults
              }
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              disabled={
                activeTab === 'movies'
                  ? selectedMovies.size === 0
                  : activeTab === 'tv' && tvViewMode === 'seasons'
                  ? selectedSeasons.size === 0
                  : activeTab === 'tv'
                  ? selectedEpisodes.size === 0
                  : selectedSearchResults.size === 0
              }
            >
              <Download className="h-4 w-4 mr-2" />
              Transfer {
                activeTab === 'movies'
                  ? (selectedMovies.size > 0 ? `${selectedMovies.size} ` : '') + 'Items'
                  : activeTab === 'tv' && tvViewMode === 'seasons'
                  ? (selectedSeasons.size > 0 ? `${selectedSeasons.size} ` : '') + 'Seasons'
                  : activeTab === 'tv'
                  ? (selectedEpisodes.size > 0 ? `${selectedEpisodes.size} ` : '') + 'Items'
                  : (selectedSearchResults.size > 0 ? `${selectedSearchResults.size} ` : '') + 'Items'
              }
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="w-full px-4 py-6">
        {/* Tab Navigation */}
        <div className="mb-6">
          <div className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('movies')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'movies'
                    ? 'border-blue-500 text-blue-600'
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:border-gray-600' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
                }`}
              >
                Movies
              </button>
              <button
                onClick={() => setActiveTab('tv')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tv'
                    ? 'border-blue-500 text-blue-600'
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:border-gray-600' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
                }`}
              >
                TV Shows
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'search'
                    ? 'border-blue-500 text-blue-600'
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:border-gray-600' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
                }`}
              >
                <Search className="h-4 w-4 inline mr-1" />
                Search
              </button>
              <button
                onClick={() => setActiveTab('settings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'settings'
                    ? 'border-blue-500 text-blue-600'
                    : `border-transparent ${darkMode ? 'text-gray-400 hover:text-gray-300 hover:border-gray-600' : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'}`
                }`}
              >
                Settings
              </button>
            </nav>
          </div>
        </div>

        {/* Transfer Progress and Server Status */}
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Transfer Progress - 1/2 width (left) */}
          <div className="lg:col-span-1">
            <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>Transfer Progress</h3>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      if (selectedServer) {
                        loadRecentMovies(selectedServer);
                        loadRecentEpisodes(selectedServer).then(() => {
                          loadRecentSeasons(selectedServer);
                        });
                      }
                    }}
                    className="inline-flex items-center px-2 py-1 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    title="Refresh file status"
                  >
                    🔄 Refresh
                  </button>
                  {activeTransfers.size > 0 && (
                    <button
                      onClick={handleCancelAllTransfers}
                      className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Cancel All
                    </button>
                  )}
                </div>
              </div>

              {activeTransfers.size > 0 ? (
                <div className="space-y-4">
                  {/* Aggregate Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        Overall Progress ({activeTransfers.size} file{activeTransfers.size !== 1 ? 's' : ''})
                      </span>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {(() => {
                          const transfers = Array.from(activeTransfers.values());
                          const totalTransferred = transfers.reduce((sum, t) => sum + (t.progress?.transferred || 0), 0);
                          const totalSize = transfers.reduce((sum, t) => sum + t.size, 0);
                          const percentage = totalSize > 0 ? Math.round((totalTransferred / totalSize) * 100) : 0;
                          return `${percentage}%`;
                        })()}
                      </span>
                    </div>

                    {/* Overall Progress Bar */}
                    <div className={`w-full ${darkMode ? 'bg-gray-600' : 'bg-gray-200'} rounded-full h-3`}>
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{
                          width: `${(() => {
                            const transfers = Array.from(activeTransfers.values());
                            const totalTransferred = transfers.reduce((sum, t) => sum + (t.progress?.transferred || 0), 0);
                            const totalSize = transfers.reduce((sum, t) => sum + t.size, 0);
                            return totalSize > 0 ? Math.round((totalTransferred / totalSize) * 100) : 0;
                          })()}%`
                        }}
                      ></div>
                    </div>

                    {/* Overall Stats */}
                    <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} space-y-1`}>
                      <div className="flex justify-between">
                        <span>Total Size:</span>
                        <span>{(() => {
                          const transfers = Array.from(activeTransfers.values());
                          console.log('Individual transfer sizes:', transfers.map(t => ({ name: t.filename, size: t.size })));

                          const totalSize = transfers.reduce((sum, t) => sum + t.size, 0);
                          console.log('Total size calculation:', totalSize, 'units (unknown)');

                          // Try different conversions to find the right one
                          const asBytes = totalSize / (1024 * 1024 * 1024); // Assume input is bytes
                          const asKB = totalSize / (1024 * 1024); // Assume input is KB
                          const asMB = totalSize / 1024; // Assume input is MB
                          const asGB = totalSize; // Assume input is already GB

                          console.log('Possible conversions:', { asBytes, asKB, asMB, asGB });

                          // If totalSize looks like it's in bytes (> 1GB), convert to GB
                          if (totalSize > 1000000000) {
                            return (totalSize / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
                          }
                          // If it looks like MB (> 1000), convert to GB
                          else if (totalSize > 1000000) {
                            return (totalSize / (1024 * 1024)).toFixed(1) + ' GB';
                          }
                          // If it looks like KB (> 1000), convert to MB
                          else if (totalSize > 1000) {
                            return (totalSize / 1024).toFixed(1) + ' MB';
                          }
                          // Otherwise assume it's already in GB
                          else {
                            return totalSize.toFixed(1) + ' GB';
                          }
                        })()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Total Transferred:</span>
                        <span>{(() => {
                          const totalTransferred = Array.from(activeTransfers.values()).reduce((sum, t) => sum + (t.progress?.transferred || 0), 0);
                          console.log('Total transferred calculation:', totalTransferred, 'bytes');
                          if (totalTransferred > 1000000000000) {
                            return (totalTransferred / (1024 * 1024)).toFixed(1) + ' GB';
                          } else if (totalTransferred > 1000000000) {
                            return (totalTransferred / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
                          } else {
                            return (totalTransferred / (1024 * 1024)).toFixed(1) + ' MB';
                          }
                        })()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avg Speed:</span>
                        <span>{(() => {
                          const speeds = Array.from(activeTransfers.values())
                            .map(t => t.progress?.speed)
                            .filter(speed => speed && speed !== '--');
                          if (speeds.length === 0) return '--';
                          // Simple average - in reality you'd weight by transfer size
                          return speeds[0]; // Just show first speed for simplicity
                        })()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>ETA:</span>
                        <span>{(() => {
                          const etas = Array.from(activeTransfers.values())
                            .map(t => t.progress?.eta)
                            .filter(eta => eta && eta !== '--');
                          if (etas.length === 0) return '--';
                          // Show longest ETA
                          return etas.sort().reverse()[0];
                        })()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Individual File Progress */}
                  <div className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-200'} pt-3`}>
                    <h4 className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Individual Files</h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Array.from(activeTransfers.values()).map((transfer) => (
                        <div key={transfer.id} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                transfer.status === 'active' ? 'bg-blue-500 animate-pulse' :
                                transfer.status === 'queued' ? 'bg-yellow-500' :
                                transfer.status === 'completed' ? 'bg-green-500' :
                                'bg-red-500'
                              }`}></div>
                              <span className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'} truncate max-w-32`}>
                                {transfer.filename}
                              </span>
                            </div>
                            <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                              {(transfer.size / (1024 * 1024 * 1024)).toFixed(1)} GB
                            </span>
                          </div>

                          {/* Individual Progress Bar */}
                          <div className={`w-full ${darkMode ? 'bg-gray-600' : 'bg-gray-100'} rounded-full h-1`}>
                            <div
                              className="bg-blue-400 h-1 rounded-full transition-all duration-300"
                              style={{ width: `${transfer.progress?.percentage || 0}%` }}
                            ></div>
                          </div>

                          {/* Error Display */}
                          {transfer.error && (
                            <div className="mt-1 p-1 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                              {transfer.error}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  <div className="text-sm">No active transfers</div>
                  <div className="text-xs mt-1">Select movies above to start transferring</div>
                </div>
              )}
            </div>
          </div>

          {/* Server Status - 1/2 width (right) */}
          {servers.length > 0 && (
            <div className="lg:col-span-1">
              <div className="grid grid-cols-1 gap-3">
                {servers.map((server) => {
                  const details = serverDetails[server.id];
                  const realName = details?.info?.name || server.name;
                  const diskInfo = details?.disk || [];

                  const mediaDisks = diskInfo
                    .filter(disk => {
                      const mediaPaths = Object.values(server.mediaPaths || {});
                      return mediaPaths.some(path => path.startsWith(disk.mountPoint) && disk.mountPoint !== '/');
                    })
                    .slice(0, 1); // Show only 1 disk for compact view

                  return (
                    <div key={server.id} className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-3`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <Server className="h-4 w-4 text-blue-600" />
                          <span className={`font-medium ${darkMode ? 'text-white' : 'text-gray-900'} text-sm`}>{realName}</span>
                        </div>
                        {server.id === 'server1' && (
                          <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-800">Source</span>
                        )}
                      </div>

                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} space-y-1`}>
                        <div>{server.ssh?.host}:{server.ssh?.port}</div>
                        {mediaDisks.length > 0 && (
                          <div className={`text-xs ${darkMode ? 'bg-gray-700' : 'bg-gray-50'} px-2 py-1 rounded`}>
                            {mediaDisks[0].mountPoint}: {mediaDisks[0].available} free
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Content Grid - Movies or TV Shows */}
        {selectedServer && (
          <>
            {/* Movies Grid */}
            {activeTab === 'movies' && recentMovies.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Recent Movies from {serverDetails[selectedServer]?.info?.name || servers.find(s => s.id === selectedServer)?.name || 'Server'}
                  </h2>
                  {selectedMovies.size > 0 && (
                    <span className="text-sm text-blue-600 font-medium">
                      {selectedMovies.size} selected
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2">
                  {recentMovies.slice(0, visibleMovies).map((movie) => {
                    const isSelected = selectedMovies.has(movie.id);
                    const posterUrl = getMoviePosterUrl(movie);
                    const existsOnDestination = movie.existsOnDestination;

                    return (
                      <div
                        key={movie.id}
                        className={`border rounded-lg p-2 cursor-pointer transition-colors relative ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                            : existsOnDestination
                            ? `${darkMode ? 'border-green-600 bg-green-900/30' : 'border-green-500 bg-green-50'}`
                            : `${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`
                        }`}
                        onClick={() => toggleMovieSelection(movie.id)}
                      >
                        {/* Status indicators */}
                        <div className="absolute top-1 right-1 z-10 flex space-x-1">
                          {/* Watch status checkmark */}
                          {movie.isWatched && (
                            <div className={`h-4 w-4 ${darkMode ? 'bg-blue-600' : 'bg-blue-500'} rounded-full flex items-center justify-center`}>
                              <CheckCircle className="h-3 w-3 text-white" />
                            </div>
                          )}

                          {/* Existing on destination indicator */}
                          {existsOnDestination && !isSelected && (
                            <CheckCircle className={`h-3 w-3 ${darkMode ? 'text-green-400' : 'text-green-600'} bg-white rounded-full`} />
                          )}
                        </div>

                        {/* Selection Checkbox */}
                        <div className="absolute top-1 left-1 z-10">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleMovieSelection(movie.id)}
                            className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                        </div>

                        {/* Watch progress bar */}
                        {movie.isPartiallyWatched && movie.watchProgress > 0 && (
                          <div className="absolute bottom-0 left-0 right-0 z-10">
                            <div className="w-full bg-black/50 h-1">
                              <div
                                className="bg-blue-500 h-1 transition-all duration-300"
                                style={{ width: `${movie.watchProgress}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col items-center space-y-1 pt-4">
                          {/* Movie Poster */}
                          <div className="w-full max-w-[100px]">
                            {posterUrl ? (
                              <img
                                src={posterUrl}
                                alt={movie.title}
                                className="w-full h-36 object-cover rounded shadow-sm"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div
                              className={`w-full h-36 bg-gray-200 rounded flex items-center justify-center shadow-sm ${
                                posterUrl ? 'hidden' : 'flex'
                              }`}
                            >
                              <FileText className="h-8 w-8 text-gray-400" />
                            </div>
                          </div>

                          {/* Movie Info */}
                          <div className="w-full text-center">
                            <h4 className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'} line-clamp-2 leading-tight`}>
                              {movie.title}
                            </h4>
                            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                              {movie.year} • {movie.duration ? `${Math.round(movie.duration / 60000)}min` : ''}
                            </p>
                            {movie.fileSize && (
                              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {Math.round(movie.fileSize / (1024 * 1024 * 1024))} GB
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Load More Button */}
                {visibleMovies < recentMovies.length && (
                  <div className="mt-6 text-center">
                    <button
                      onClick={loadMoreMovies}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Load More ({recentMovies.length - visibleMovies} remaining)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TV Content - Episodes or Seasons */}
            {activeTab === 'tv' && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Recent TV Content from {serverDetails[selectedServer]?.info?.name || servers.find(s => s.id === selectedServer)?.name || 'Server'}
                  </h2>
                  <div className="flex items-center space-x-4">
                    {/* View Toggle */}
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>View:</span>
                      <div className={`flex ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-1`}>
                        <button
                          onClick={() => setTvViewMode('episodes')}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            tvViewMode === 'episodes'
                              ? `${darkMode ? 'bg-gray-600 text-blue-400' : 'bg-white text-blue-600'} shadow-sm`
                              : `${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`
                          }`}
                        >
                          Episodes
                        </button>
                        <button
                          onClick={() => setTvViewMode('seasons')}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                            tvViewMode === 'seasons'
                              ? `${darkMode ? 'bg-gray-600 text-blue-400' : 'bg-white text-blue-600'} shadow-sm`
                              : `${darkMode ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`
                          }`}
                        >
                          Seasons
                        </button>
                      </div>
                    </div>

                    {/* Selection Count */}
                    {(tvViewMode === 'episodes' ? selectedEpisodes.size : selectedSeasons.size) > 0 && (
                      <span className="text-sm text-blue-600 font-medium">
                        {tvViewMode === 'episodes' ? selectedEpisodes.size : selectedSeasons.size} selected
                      </span>
                    )}
                  </div>
                </div>

                {/* Episodes View */}
                {tvViewMode === 'episodes' && recentEpisodes.length > 0 && (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2">
                      {recentEpisodes.slice(0, visibleEpisodes).map((episode) => {
                        const isSelected = selectedEpisodes.has(episode.id);
                        const posterUrl = getEpisodePosterUrl(episode);
                        const existsOnDestination = episode.existsOnDestination;

                        return (
                          <div
                            key={episode.id}
                        className={`border rounded-lg p-2 cursor-pointer transition-colors relative ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                            : existsOnDestination
                            ? `${darkMode ? 'border-green-600 bg-green-900/30' : 'border-green-500 bg-green-50'}`
                            : `${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`
                        }`}
                            onClick={() => toggleEpisodeSelection(episode.id)}
                          >
                            {/* Status indicators */}
                            <div className="absolute top-1 right-1 z-10 flex space-x-1">
                              {/* Watch status checkmark */}
                              {episode.isWatched && (
                                <div className={`h-4 w-4 ${darkMode ? 'bg-blue-600' : 'bg-blue-500'} rounded-full flex items-center justify-center`}>
                                  <CheckCircle className="h-3 w-3 text-white" />
                                </div>
                              )}

                              {/* Existing on destination indicator */}
                              {existsOnDestination && !isSelected && (
                                <CheckCircle className={`h-3 w-3 ${darkMode ? 'text-green-400' : 'text-green-600'} bg-white rounded-full`} />
                              )}
                            </div>

                            {/* Selection Checkbox */}
                            <div className="absolute top-1 left-1 z-10">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleEpisodeSelection(episode.id)}
                                className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </div>

                            {/* Watch progress bar */}
                            {episode.isPartiallyWatched && episode.watchProgress > 0 && (
                              <div className="absolute bottom-0 left-0 right-0 z-10">
                                <div className="w-full bg-black/50 h-1">
                                  <div
                                    className="bg-blue-500 h-1 transition-all duration-300"
                                    style={{ width: `${episode.watchProgress}%` }}
                                  ></div>
                                </div>
                              </div>
                            )}

                            <div className="flex flex-col items-center space-y-1 pt-4">
                              {/* Episode Poster */}
                              <div className="w-full max-w-[100px]">
                                {posterUrl ? (
                                  <img
                                    src={posterUrl}
                                    alt={episode.title}
                                    className="w-full h-36 object-cover rounded shadow-sm"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div
                                  className={`w-full h-36 bg-gray-200 rounded flex items-center justify-center shadow-sm ${
                                    posterUrl ? 'hidden' : 'flex'
                                  }`}
                                >
                                  <FileText className="h-8 w-8 text-gray-400" />
                                </div>
                              </div>

                              {/* Episode Info */}
                              <div className="w-full text-center">
                                <h4 className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'} line-clamp-2 leading-tight`}>
                                  {episode.showTitle}
                                </h4>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-0.5`}>
                                  S{episode.seasonNumber}E{episode.episodeNumber} - {episode.originalTitle}
                                </p>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                                  {episode.year} • {episode.duration ? `${Math.round(episode.duration / 60000)}min` : ''}
                                </p>
                                {episode.fileSize && (
                                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {Math.round(episode.fileSize / (1024 * 1024 * 1024))} GB
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Load More Button */}
                    {visibleEpisodes < recentEpisodes.length && (
                      <div className="mt-6 text-center">
                        <button
                          onClick={loadMoreEpisodes}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Load More ({recentEpisodes.length - visibleEpisodes} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Seasons View */}
                {tvViewMode === 'seasons' && recentSeasons.length > 0 && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
                      {recentSeasons.slice(0, visibleSeasons).map((season) => {
                        const isSelected = selectedSeasons.has(season.id);
                        const posterUrl = season.art ? apiService.getMoviePosterUrl(selectedServer, season.art) : null;
                        const existsOnDestination = season.existsOnDestination;
                        const partiallyExists = season.partiallyExists;

                        return (
                          <div
                            key={season.id}
                            className={`border rounded-lg p-3 cursor-pointer transition-colors relative ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                                : existsOnDestination
                                ? `${darkMode ? 'border-green-600 bg-green-900/30' : 'border-green-500 bg-green-50'}`
                                : partiallyExists
                                ? `${darkMode ? 'border-yellow-600 bg-yellow-900/30' : 'border-yellow-500 bg-yellow-50'}`
                                : `${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`
                            }`}
                            onClick={() => toggleSeasonSelection(season.id)}
                          >
                            {/* Status indicators */}
                            <div className="absolute top-2 right-2 z-10 flex space-x-1">
                              {existsOnDestination && !isSelected && (
                                <CheckCircle className={`h-4 w-4 ${darkMode ? 'text-green-400' : 'text-green-600'} bg-white rounded-full`} />
                              )}
                              {partiallyExists && !existsOnDestination && !isSelected && (
                                <div className={`h-4 w-4 ${darkMode ? 'bg-yellow-600' : 'bg-yellow-500'} rounded-full flex items-center justify-center`}>
                                  <span className="text-white text-xs">!</span>
                                </div>
                              )}
                            </div>

                            {/* Selection Checkbox */}
                            <div className="absolute top-2 left-2 z-10">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSeasonSelection(season.id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                              />
                            </div>

                            <div className="flex flex-col items-center space-y-3 pt-6">
                              {/* Season Poster */}
                              <div className="w-full max-w-[120px]">
                                {posterUrl ? (
                                  <img
                                    src={posterUrl}
                                    alt={`${season.showTitle} Season ${season.seasonNumber}`}
                                    className="w-full h-40 object-cover rounded shadow-sm"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div
                                  className={`w-full h-40 bg-gray-200 rounded flex items-center justify-center shadow-sm ${
                                    posterUrl ? 'hidden' : 'flex'
                                  }`}
                                >
                                  <FileText className="h-10 w-10 text-gray-400" />
                                </div>
                              </div>

                              {/* Season Info */}
                              <div className="w-full text-center">
                                <h4 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'} line-clamp-2 leading-tight mb-1`}>
                                  {season.showTitle}
                                </h4>
                                <p className="text-sm font-semibold text-blue-600">
                                  Season {season.seasonNumber}
                                </p>
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>
                                  {season.episodeCount} episodes
                                </p>
                                {season.totalSize && (
                                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {Math.round(season.totalSize / (1024 * 1024 * 1024))} GB total
                                  </p>
                                )}
                                {season.year && (
                                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    {season.year}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Load More Button */}
                    {visibleSeasons < recentSeasons.length && (
                      <div className="mt-6 text-center">
                        <button
                          onClick={loadMoreSeasons}
                          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          Load More ({recentSeasons.length - visibleSeasons} remaining)
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Search Content */}
            {activeTab === 'search' && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className={`text-lg font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Search Content from {serverDetails[selectedServer]?.info?.name || servers.find(s => s.id === selectedServer)?.name || 'Server'}
                  </h2>
                  {selectedSearchResults.size > 0 && (
                    <span className="text-sm text-blue-600 font-medium">
                      {selectedSearchResults.size} selected
                    </span>
                  )}
                </div>

                {/* Search Input */}
                <div className="mb-6">
                  <div className={`flex ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <Search className={`h-5 w-5 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        <input
                          type="text"
                          placeholder="Search for movies, TV shows, or episodes..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter' && searchQuery.trim()) {
                              performSearch(searchQuery.trim());
                            }
                          }}
                          className={`flex-1 text-sm ${darkMode ? 'bg-gray-800 text-white placeholder-gray-400' : 'bg-white text-gray-900 placeholder-gray-500'} border-0 focus:ring-0 focus:outline-none`}
                          disabled={isSearching}
                        />
                        <button
                          onClick={() => searchQuery.trim() && performSearch(searchQuery.trim())}
                          disabled={!searchQuery.trim() || isSearching}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSearching ? 'Searching...' : 'Search'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 3xl:grid-cols-8 gap-2">
                    {searchResults.map((result) => {
                      const isSelected = selectedSearchResults.has(result.id);
                      const posterUrl = result.contentType === 'movie'
                        ? (result.thumb ? apiService.getMoviePosterUrl(selectedServer, result.thumb) : null)
                        : (result.art ? apiService.getMoviePosterUrl(selectedServer, result.art) : null);
                      const existsOnDestination = result.existsOnDestination;

                      return (
                        <div
                          key={result.id}
                          className={`border rounded-lg p-2 cursor-pointer transition-colors relative ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                              : existsOnDestination
                              ? `${darkMode ? 'border-green-600 bg-green-900/30' : 'border-green-500 bg-green-50'}`
                              : `${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-200 hover:bg-gray-50'}`
                          }`}
                          onClick={() => toggleSearchResultSelection(result.id)}
                        >
                          {/* Status indicators */}
                          <div className="absolute top-1 right-1 z-10 flex space-x-1">
                            {/* Watch status checkmark */}
                            {result.isWatched && (
                              <div className={`h-4 w-4 ${darkMode ? 'bg-blue-600' : 'bg-blue-500'} rounded-full flex items-center justify-center`}>
                                <CheckCircle className="h-3 w-3 text-white" />
                              </div>
                            )}

                            {/* Existing on destination indicator */}
                            {existsOnDestination && !isSelected && (
                              <CheckCircle className={`h-3 w-3 ${darkMode ? 'text-green-400' : 'text-green-600'} bg-white rounded-full`} />
                            )}
                          </div>

                          {/* Selection Checkbox */}
                          <div className="absolute top-1 left-1 z-10">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSearchResultSelection(result.id)}
                              className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                          </div>

                          {/* Watch progress bar */}
                          {result.isPartiallyWatched && result.watchProgress > 0 && (
                            <div className="absolute bottom-0 left-0 right-0 z-10">
                              <div className="w-full bg-black/50 h-1">
                                <div
                                  className="bg-blue-500 h-1 transition-all duration-300"
                                  style={{ width: `${result.watchProgress}%` }}
                                ></div>
                              </div>
                            </div>
                          )}

                          <div className="flex flex-col items-center space-y-1 pt-4">
                            {/* Content Poster */}
                            <div className="w-full max-w-[100px]">
                              {posterUrl ? (
                                <img
                                  src={posterUrl}
                                  alt={result.title}
                                  className="w-full h-36 object-cover rounded shadow-sm"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className={`w-full h-36 bg-gray-200 rounded flex items-center justify-center shadow-sm ${
                                  posterUrl ? 'hidden' : 'flex'
                                }`}
                              >
                                <FileText className="h-8 w-8 text-gray-400" />
                              </div>
                            </div>

                            {/* Content Info */}
                            <div className="w-full text-center">
                              <h4 className={`text-xs font-medium ${darkMode ? 'text-white' : 'text-gray-900'} line-clamp-2 leading-tight`}>
                                {result.title}
                              </h4>
                              {result.contentType === 'episode' && result.showTitle && (
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-0.5`}>
                                  {result.showTitle}
                                </p>
                              )}
                              <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'} mt-0.5`}>
                                {result.year} • {result.contentType}
                              </p>
                              {result.fileSize && (
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {Math.round(result.fileSize / (1024 * 1024 * 1024))} GB
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No Results Message */}
                {searchQuery && !isSearching && searchResults.length === 0 && (
                  <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <div className="text-lg font-medium mb-2">No results found</div>
                    <div className="text-sm">Try a different search term</div>
                  </div>
                )}

                {/* Initial Search Message */}
                {!searchQuery && !isSearching && searchResults.length === 0 && (
                  <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <div className="text-lg font-medium mb-2">Search for content</div>
                    <div className="text-sm">Enter a movie title, TV show name, or episode to find and transfer</div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <Settings darkMode={darkMode} />
        )}

        {/* Transfer History - Compact */}
        {transferHistory.length > 0 && activeTab !== 'settings' && (
          <div className={`${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} border rounded-lg p-4`}>
            <h3 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'} mb-3`}>Recent Transfers</h3>
            <div className="space-y-2">
              {transferHistory.slice(0, 5).map((transfer) => (
                <div key={transfer.id} className="flex items-center justify-between py-1">
                  <div className="flex items-center space-x-2">
                    {transfer.status === 'completed' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'} truncate max-w-xs`}>
                      {transfer.filename}
                    </span>
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {new Date(transfer.completedAt || transfer.createdAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return renderContent();
}

export default App;
