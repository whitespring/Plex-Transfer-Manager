import React, { useState, useEffect } from 'react';
import { Film, Tv, Loader, AlertCircle, Calendar, Clock } from 'lucide-react';

export default function RecentlyAdded({ serverUrl, token }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (serverUrl && token) {
      fetchRecentlyAdded();
    }
  }, [serverUrl, token]);

  const fetchRecentlyAdded = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(
        `${serverUrl}/library/recentlyAdded?X-Plex-Token=${token}`
      );
      const text = await response.text();
      const parser = new DOMParser();
      const xml = parser.parseFromString(text, 'text/xml');
      
      // Get all Video elements (movies/episodes) and Directory elements (TV shows/seasons)
      const videos = Array.from(xml.querySelectorAll('Video'));
      const directories = Array.from(xml.querySelectorAll('Directory'));
      
      const allItems = [];
      
      // Process all videos (both movies and episodes)
      videos.forEach(video => {
        const type = video.getAttribute('type');
        const isEpisode = type === 'episode';
        
        const item = {
          ratingKey: video.getAttribute('ratingKey'),
          title: video.getAttribute('title'),
          year: video.getAttribute('year'),
          addedAt: parseInt(video.getAttribute('addedAt')),
          thumb: video.getAttribute('thumb') || video.getAttribute('art'),
          type: isEpisode ? 'episode' : 'movie',
          summary: video.getAttribute('summary')
        };
        
        // Episode-specific fields
        if (isEpisode) {
          item.grandparentTitle = video.getAttribute('grandparentTitle');
          item.grandparentThumb = video.getAttribute('grandparentThumb');
          item.seasonNumber = video.getAttribute('parentIndex');
          item.episodeNumber = video.getAttribute('index');
        }
        
        allItems.push(item);
      });
      
      // Process TV shows and seasons
      // For seasons, fetch the most recent episode to display
      for (const dir of directories) {
        const type = dir.getAttribute('type');
        
        if (type === 'show') {
          // Add the show itself
          const item = {
            ratingKey: dir.getAttribute('ratingKey'),
            title: dir.getAttribute('title'),
            year: dir.getAttribute('year'),
            addedAt: parseInt(dir.getAttribute('addedAt')),
            thumb: dir.getAttribute('thumb') || dir.getAttribute('art'),
            type: 'show',
            summary: dir.getAttribute('summary')
          };
          allItems.push(item);
        } else if (type === 'season') {
          // For seasons, fetch episodes to get the most recent one
          const seasonKey = dir.getAttribute('ratingKey');
          const showTitle = dir.getAttribute('parentTitle');
          const showThumb = dir.getAttribute('parentThumb');
          const seasonNumber = dir.getAttribute('index');
          
          try {
            const episodesResponse = await fetch(
              `${serverUrl}/library/metadata/${seasonKey}/children?X-Plex-Token=${token}`
            );
            const episodesText = await episodesResponse.text();
            const episodesParser = new DOMParser();
            const episodesXml = episodesParser.parseFromString(episodesText, 'text/xml');
            const episodes = Array.from(episodesXml.querySelectorAll('Video'));
            
            // Add all episodes from this season
            episodes.forEach(episode => {
              const item = {
                ratingKey: episode.getAttribute('ratingKey'),
                title: episode.getAttribute('title'),
                year: episode.getAttribute('year'),
                addedAt: parseInt(episode.getAttribute('addedAt')),
                thumb: episode.getAttribute('thumb') || episode.getAttribute('art'),
                type: 'episode',
                grandparentTitle: showTitle || episode.getAttribute('grandparentTitle'),
                grandparentThumb: showThumb || episode.getAttribute('grandparentThumb'),
                seasonNumber: seasonNumber || episode.getAttribute('parentIndex'),
                episodeNumber: episode.getAttribute('index'),
                summary: episode.getAttribute('summary')
              };
              allItems.push(item);
            });
          } catch (err) {
            console.error('Error fetching episodes for season:', err);
          }
        }
      }
      
      // Sort by addedAt (newest first)
      allItems.sort((a, b) => b.addedAt - a.addedAt);
      
      setItems(allItems);
    } catch (err) {
      setError('Fehler beim Laden der zuletzt hinzugefügten Inhalte: ' + err.message);
      console.error('Error fetching recently added:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Unbekannt';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Heute';
    if (diffDays === 1) return 'Gestern';
    if (diffDays < 7) return `Vor ${diffDays} Tagen`;
    if (diffDays < 30) return `Vor ${Math.floor(diffDays / 7)} Wochen`;
    if (diffDays < 365) return `Vor ${Math.floor(diffDays / 30)} Monaten`;
    
    return date.toLocaleDateString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  const getImageUrl = (item) => {
    // For episodes, prefer grandparent (show) thumb over episode thumb
    const thumb = item.type === 'episode' && item.grandparentThumb 
      ? item.grandparentThumb 
      : item.thumb;
    
    if (!thumb) return null;
    return `${serverUrl}${thumb}?X-Plex-Token=${token}`;
  };

  const getDisplayTitle = (item) => {
    if (item.type === 'episode') {
      const seasonEpisode = `S${String(item.seasonNumber).padStart(2, '0')}E${String(item.episodeNumber).padStart(2, '0')}`;
      return (
        <div>
          <div className="font-semibold">{item.grandparentTitle || item.title}</div>
          <div className="text-sm text-gray-400">{seasonEpisode} - {item.title}</div>
        </div>
      );
    }
    return <div className="font-semibold">{item.title}</div>;
  };

  const getTypeIcon = (type) => {
    if (type === 'movie') {
      return <Film size={16} className="text-blue-400" />;
    } else if (type === 'show' || type === 'episode') {
      return <Tv size={16} className="text-purple-400" />;
    }
    return null;
  };

  const getTypeBadge = (type) => {
    const styles = {
      movie: 'bg-blue-600',
      show: 'bg-purple-600',
      episode: 'bg-purple-600'
    };
    
    const labels = {
      movie: 'Film',
      show: 'Serie',
      episode: 'Episode'
    };
    
    return (
      <span className={`px-2 py-1 rounded text-xs font-semibold ${styles[type] || 'bg-gray-600'}`}>
        {labels[type] || type}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
        <Loader className="animate-spin mx-auto mb-4" size={48} />
        <p className="text-xl font-semibold">Lade zuletzt hinzugefügte Inhalte...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-400 bg-red-900/20 p-3 rounded-lg">
        <AlertCircle size={20} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Zuletzt hinzugefügt</h2>
        <button
          onClick={fetchRecentlyAdded}
          className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
        >
          <Clock size={16} />
          <span className="text-sm">Aktualisieren</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="bg-gray-800 rounded-lg p-8 text-center border border-gray-700">
          <Calendar size={48} className="text-gray-500 mx-auto mb-4" />
          <p className="text-xl font-semibold mb-2">Keine kürzlich hinzugefügten Inhalte</p>
          <p className="text-gray-400">Es wurden keine neuen Filme oder Serien gefunden.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => {
            const imageUrl = getImageUrl(item);
            
            return (
              <div
                key={item.ratingKey}
                className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-all hover:scale-105 hover:shadow-xl"
              >
                <div className="relative aspect-[2/3] bg-gray-900">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className={`${imageUrl ? 'hidden' : 'flex'} absolute inset-0 items-center justify-center bg-gray-900`}
                  >
                    {getTypeIcon(item.type)}
                  </div>
                  <div className="absolute top-2 right-2">
                    {getTypeBadge(item.type)}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3">
                    <div className="flex items-center gap-1 text-xs text-gray-300">
                      <Calendar size={12} />
                      <span>{formatDate(item.addedAt)}</span>
                    </div>
                  </div>
                </div>
                <div className="p-3">
                  <div className="text-sm mb-1">
                    {getDisplayTitle(item)}
                  </div>
                  {item.year && (
                    <div className="text-xs text-gray-500">{item.year}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
