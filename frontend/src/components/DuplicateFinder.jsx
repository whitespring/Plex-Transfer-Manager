import React, { useState } from 'react';
import { Search, Film, Tv, AlertCircle, CheckCircle, Loader, ExternalLink, Filter } from 'lucide-react';

// Arr Link Component - Simplified (no API calls)
function ArrLink({ item, radarrUrl, sonarrUrl }) {
  const isMovie = item.type === 'movie';
  const baseUrl = isMovie ? radarrUrl : sonarrUrl;
  const serviceName = isMovie ? 'Radarr' : 'Sonarr';

  if (!baseUrl) return null;

  const searchUrl = `${baseUrl}/add/new?term=${encodeURIComponent(item.title)}`;
  
  return (
    <a
      href={searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
    >
      <Search size={16} />
      <span>In {serviceName} suchen</span>
      <ExternalLink size={14} />
    </a>
  );
}

export default function DuplicateFinder({ serverUrl, token, sonarrUrl, radarrUrl, libraries, selectedLibrary, setSelectedLibrary }) {
  const [loading, setLoading] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [error, setError] = useState('');
  const [filterMode, setFilterMode] = useState('duplicates');

  const scanLibrary = async (mode = filterMode, libraryKey = null) => {
    const libKey = libraryKey || selectedLibrary;
    
    if (!libKey) {
      setError('Bitte eine Bibliothek auswählen');
      return;
    }

    setLoading(true);
    setError('');
    setDuplicates([]);
    setFilterMode(mode);

    try {
      const response = await fetch(
        `${serverUrl}/library/sections/${libKey}/all?X-Plex-Token=${token}`
      );
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      
      // Check if this is a TV show library (returns Directory tags) or movie library (returns Video tags)
      const directories = Array.from(xml.querySelectorAll('Directory'));
      const isShowLibrary = directories.length > 0 && directories[0].getAttribute('type') === 'show';
      
      let items = [];
      
      if (isShowLibrary) {
        // For TV shows: Get all episodes for each show
        for (const show of directories) {
          const showKey = show.getAttribute('ratingKey');
          const showTitle = show.getAttribute('title');
          const showYear = show.getAttribute('year');
          
          // Fetch episodes for this show
          const episodesResponse = await fetch(
            `${serverUrl}/library/metadata/${showKey}/allLeaves?X-Plex-Token=${token}`
          );
          const episodesText = await episodesResponse.text();
          const episodesParser = new DOMParser();
          const episodesXml = episodesParser.parseFromString(episodesText, 'text/xml');
          const episodes = Array.from(episodesXml.querySelectorAll('Video'));
          
          // Add show info to each episode
          episodes.forEach(ep => {
            ep.setAttribute('showTitle', showTitle);
            ep.setAttribute('showYear', showYear);
          });
          
          items.push(...episodes);
        }
      } else {
        // For movies: use Video tags directly
        items = Array.from(xml.querySelectorAll('Video'));
      }
      
      // Gruppiere nach Titel
      const groupedByTitle = {};
      
      for (const item of items) {
        // For TV shows, use series title (grandparentTitle) instead of episode title
        const isEpisode = item.getAttribute('type') === 'episode';
        const title = isEpisode 
          ? item.getAttribute('grandparentTitle') || item.getAttribute('title')
          : item.getAttribute('title');
        const year = isEpisode 
          ? item.getAttribute('grandparentYear') || item.getAttribute('year')
          : item.getAttribute('year');
        const season = isEpisode 
          ? item.getAttribute('parentIndex') || item.getAttribute('seasonNumber')
          : null;
        
        // For TV shows: group by title and season, for movies: group by title and year
        const key = isEpisode ? `${title}_S${season}` : `${title}_${year}`;
        
        if (!groupedByTitle[key]) {
          // Detect type: check type attribute first, then fall back to tagName
          const itemType = item.getAttribute('type');
          const type = (itemType === 'movie' || item.tagName === 'Movie') ? 'movie' : 'show';
          
          groupedByTitle[key] = {
            title,
            year,
            season,
            type,
            versions: []
          };
        }

        // Hole Media-Informationen
        const media = item.querySelector('Media');
        if (media) {
          const part = media.querySelector('Part');
          const filePath = part ? part.getAttribute('file') : null;
          const fileName = filePath ? filePath.split('/').pop() : null;
          
          const version = {
            resolution: media.getAttribute('videoResolution') || 'unknown',
            width: media.getAttribute('width'),
            height: media.getAttribute('height'),
            bitrate: media.getAttribute('bitrate'),
            codec: media.getAttribute('videoCodec'),
            container: media.getAttribute('container'),
            size: part ? part.getAttribute('size') : null,
            fileName: fileName,
            filePath: filePath
          };
          
          // For TV shows, add season info
          if (isEpisode) {
            version.season = item.getAttribute('parentIndex') || item.getAttribute('seasonNumber');
            version.episode = item.getAttribute('index') || item.getAttribute('episodeNumber');
          }
          
          groupedByTitle[key].versions.push(version);
        }
      }

      // Filter basierend auf Modus
      let filtered = Object.values(groupedByTitle);

      switch (mode) {
        case 'duplicates':
          // Nur Titel mit mehreren Versionen
          filtered = filtered.filter(item => item.versions.length > 1);
          break;
        case '720p':
          // Alle mit 720p Version
          filtered = filtered.filter(item => 
            item.versions.some(v => v.resolution === '720')
          );
          break;
        case '1080p':
          // Alle mit 1080p Version
          filtered = filtered.filter(item => 
            item.versions.some(v => v.resolution === '1080')
          );
          break;
        case '4k':
          // Alle mit 4K Version
          filtered = filtered.filter(item => 
            item.versions.some(v => v.resolution === '4k')
          );
          break;
        case 'low':
          // Niedrige Qualität (480p oder niedriger)
          filtered = filtered.filter(item => 
            item.versions.some(v => v.resolution === '480' || v.resolution === 'sd')
          );
          break;
        default:
          break;
      }

      // Sortiere Versionen nach Qualität
      const results = filtered.map(item => ({
        ...item,
        versions: item.versions.sort((a, b) => {
          const resOrder = { '4k': 4, '1080': 3, '720': 2, '480': 1, 'sd': 0, 'unknown': -1 };
          return (resOrder[b.resolution] || 0) - (resOrder[a.resolution] || 0);
        })
      }));

      setDuplicates(results);
    } catch (err) {
      setError('Fehler beim Scannen der Bibliothek: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'N/A';
    const gb = (bytes / (1024 * 1024 * 1024)).toFixed(2);
    return `${gb} GB`;
  };

  const formatBitrate = (bitrate) => {
    if (!bitrate) return 'N/A';
    const mbps = (bitrate / 1000).toFixed(1);
    return `${mbps} Mbps`;
  };

  const getQualityBadgeColor = (resolution) => {
    const colors = {
      '4k': 'bg-purple-500',
      '1080': 'bg-blue-500',
      '720': 'bg-green-500',
      '480': 'bg-yellow-500',
      'sd': 'bg-gray-500'
    };
    return colors[resolution] || 'bg-gray-400';
  };

  return (
    <>
      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg mb-6">
          <AlertCircle size={20} />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-6 shadow-xl border border-gray-700 mb-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Bibliothek auswählen</label>
            <select
              value={selectedLibrary}
              onChange={(e) => {
                const newLibrary = e.target.value;
                setSelectedLibrary(newLibrary);
                if (newLibrary) {
                  // Auto-scan when library changes - pass library key directly
                  scanLibrary(filterMode, newLibrary);
                }
              }}
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Bibliothek wählen --</option>
              {libraries.map(lib => (
                <option key={lib.key} value={lib.key}>
                  {lib.title} ({lib.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 flex items-center gap-2">
              <Filter size={16} />
              Filtermodus
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <button
                onClick={() => scanLibrary('duplicates')}
                disabled={loading || !selectedLibrary}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === 'duplicates'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                Duplikate
              </button>
              <button
                onClick={() => scanLibrary('720p')}
                disabled={loading || !selectedLibrary}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === '720p'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                720p
              </button>
              <button
                onClick={() => scanLibrary('1080p')}
                disabled={loading || !selectedLibrary}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === '1080p'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                1080p
              </button>
              <button
                onClick={() => scanLibrary('4k')}
                disabled={loading || !selectedLibrary}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === '4k'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                4K
              </button>
              <button
                onClick={() => scanLibrary('low')}
                disabled={loading || !selectedLibrary}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterMode === 'low'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                } disabled:bg-gray-600 disabled:cursor-not-allowed`}
              >
                ≤480p
              </button>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <Loader className="animate-spin mx-auto mb-4" size={48} />
          <p className="text-xl font-semibold">Scanne Bibliothek...</p>
        </div>
      )}

      {!loading && duplicates.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold mb-4">
            {duplicates.length} {duplicates.length === 1 ? 'Titel' : 'Titel'} mit mehreren Qualitätsstufen gefunden
          </h2>

          {duplicates.map((item, idx) => (
            <div key={idx} className="bg-gray-800 rounded-lg p-6 shadow-xl border border-gray-700">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  {item.type === 'movie' ? (
                    <Film size={32} className="text-blue-400" />
                  ) : (
                    <Tv size={32} className="text-purple-400" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-semibold mb-1">
                        {item.title}
                        {item.season && ` - Season ${item.season}`}
                      </h3>
                      <p className="text-gray-400 text-sm">{item.year}</p>
                    </div>
                    <ArrLink item={item} radarrUrl={radarrUrl} sonarrUrl={sonarrUrl} />
                  </div>

                  <div className="space-y-2">
                    {item.versions.map((version, vIdx) => (
                      <div key={vIdx} className="bg-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getQualityBadgeColor(version.resolution)}`}>
                              {version.resolution.toUpperCase()}
                            </span>
                            <span className="text-sm text-gray-300">
                              {version.width}×{version.height}
                            </span>
                            <span className="text-sm text-gray-400">
                              {version.codec?.toUpperCase() || 'N/A'}
                            </span>
                            <span className="text-sm text-gray-400">
                              {version.container?.toUpperCase() || 'N/A'}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-gray-300">
                            {formatFileSize(version.size)}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>Bitrate: {formatBitrate(version.bitrate)}</span>
                            {version.season && (
                              <span className="text-gray-500">
                                • Season {version.season}
                                {version.episode && ` Episode ${version.episode}`}
                              </span>
                            )}
                          </div>
                          {version.fileName && (
                            <div className="text-xs text-gray-500 font-mono truncate" title={version.filePath}>
                              📁 {version.fileName}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && duplicates.length === 0 && selectedLibrary && (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <CheckCircle size={48} className="text-green-400 mx-auto mb-4" />
          <p className="text-xl font-semibold mb-2">Keine Duplikate gefunden!</p>
          <p className="text-gray-400">Alle Titel in dieser Bibliothek existieren nur in einer Qualität.</p>
        </div>
      )}
    </>
  );
}
