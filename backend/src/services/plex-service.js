import fetch from 'node-fetch';
import xml2js from 'xml2js';

class PlexService {
  constructor() {
    this.baseHeaders = {
      'Accept': 'application/xml',
      'X-Plex-Token': '',
    };
  }

  /**
   * Set the Plex token for API requests
   * @param {string} token - Plex authentication token
   */
  setToken(token) {
    this.baseHeaders['X-Plex-Token'] = token;
  }

  /**
   * Get server information from Plex API
   * @param {string} serverUrl - Plex server URL (e.g., http://192.168.0.105:32400)
   * @param {string} token - Plex token for this server
   * @returns {Promise<Object>} Server information
   */
  async getServerInfo(serverUrl, token) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      const response = await fetch(`${serverUrl}/`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();

      // Parse XML response
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      // Extract server information from XML attributes
      if (result.MediaContainer && result.MediaContainer.$) {
        const attrs = result.MediaContainer.$;
        return {
          name: attrs.friendlyName || attrs.machineIdentifier,
          machineIdentifier: attrs.machineIdentifier,
          version: attrs.version,
          platform: attrs.platform,
          platformVersion: attrs.platformVersion,
          updatedAt: attrs.updatedAt,
          owner: attrs.myPlexUsername,
        };
      }

      throw new Error('Invalid Plex server XML response');
    } catch (error) {
      console.error('Error fetching Plex server info:', error);
      throw new Error(`Failed to get server info: ${error.message}`);
    }
  }

  /**
   * Get recently added content (movies and TV episodes) from a Plex server
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {number} limit - Number of items to return per type (default: 25)
   * @returns {Promise<Array>} Array of recent content (movies and episodes)
   */
  async getRecentlyAddedContent(serverUrl, token, limit = 25) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching recent content: limit=${limit}`);

      // Fetch movies from Movies library (section 1) and episodes from TV library (section 2)
      const [moviesResponse, episodesResponse] = await Promise.all([
        fetch(`${serverUrl}/library/sections/1/recentlyAdded?limit=${limit}`, { headers }),
        fetch(`${serverUrl}/library/sections/2/recentlyAdded?limit=${limit}`, { headers })
      ]);

      console.log(`API responses: movies=${moviesResponse.status}, episodes=${episodesResponse.status}`);

      if (!moviesResponse.ok || !episodesResponse.ok) {
        throw new Error(`Plex API error: movies=${moviesResponse.status}, episodes=${episodesResponse.status}`);
      }

      // Parse both responses
      const parser = new xml2js.Parser({ explicitArray: false });
      const [moviesResult, episodesResult] = await Promise.all([
        parser.parseStringPromise(await moviesResponse.text()),
        parser.parseStringPromise(await episodesResponse.text())
      ]);

      const allContent = [];

      // Process movies
      if (moviesResult.MediaContainer && moviesResult.MediaContainer.Video) {
        const movies = Array.isArray(moviesResult.MediaContainer.Video)
          ? moviesResult.MediaContainer.Video
          : [moviesResult.MediaContainer.Video];

        console.log(`Found ${movies.length} movies`);
        const movieItems = movies.map(video => this.parseVideoItem(video, 'movie'));
        allContent.push(...movieItems);
      } else {
        console.log('No movies found in response');
      }

      // Process episodes
      if (episodesResult.MediaContainer && episodesResult.MediaContainer.Video) {
        const episodes = Array.isArray(episodesResult.MediaContainer.Video)
          ? episodesResult.MediaContainer.Video
          : [episodesResult.MediaContainer.Video];

        console.log(`Found ${episodes.length} episodes`);
        const episodeItems = episodes.map(video => this.parseVideoItem(video, 'episode'));
        allContent.push(...episodeItems);
      } else {
        console.log('No episodes found in response');
      }

      console.log(`Total content items: ${allContent.length}`);

      // Sort by addedAt (most recent first) and return
      const sortedContent = allContent
        .sort((a, b) => parseInt(b.addedAt) - parseInt(a.addedAt))
        .slice(0, limit * 2); // Return up to limit*2 total items

      console.log(`Returning ${sortedContent.length} sorted items`);
      return sortedContent;

    } catch (error) {
      console.error('Error fetching recent content:', error);
      throw new Error(`Failed to get recent content: ${error.message}`);
    }
  }

  /**
   * Parse a video item (movie or episode) from Plex XML
   * @param {Object} video - Video XML object
   * @param {string} contentType - 'movie' or 'episode'
   * @returns {Object} Parsed content item
   */
  parseVideoItem(video, contentType) {
    // Extract file information from Media/Part structure
    let filePath = null;
    let fileSize = null;

    if (video.Media) {
      // Handle Media as array or single object
      const mediaArray = Array.isArray(video.Media) ? video.Media : [video.Media];

      // Get the first media item (usually the main one)
      const media = mediaArray[0];

      if (media && media.Part) {
        // Handle Part as array or single object
        const partArray = Array.isArray(media.Part) ? media.Part : [media.Part];

        // Get the first part (usually the main file)
        const part = partArray[0];

        if (part && part.$) {
          filePath = part.$.file || null;
          fileSize = part.$.size ? parseInt(part.$.size, 10) : null;
        }
      }
    }

    // Build display title and metadata based on content type
    let displayTitle = video.$.title;
    let showTitle = null;
    let seasonNumber = null;
    let episodeNumber = null;

    if (contentType === 'episode') {
      // For episodes, get show title from parent metadata
      showTitle = video.$.grandparentTitle || video.$.parentTitle;
      seasonNumber = video.$.parentIndex ? parseInt(video.$.parentIndex) : null;
      episodeNumber = video.$.index ? parseInt(video.$.index) : null;

      // Format display title as "Show Name - SXXEXX - Episode Title"
      const seasonStr = seasonNumber ? `S${seasonNumber.toString().padStart(2, '0')}` : '';
      const episodeStr = episodeNumber ? `E${episodeNumber.toString().padStart(2, '0')}` : '';
      displayTitle = `${showTitle} - ${seasonStr}${episodeStr} - ${video.$.title}`;
    }

    // Extract watch status information
    const viewCount = video.$.viewCount ? parseInt(video.$.viewCount, 10) : 0;
    const viewOffset = video.$.viewOffset ? parseInt(video.$.viewOffset, 10) : 0;
    const lastViewedAt = video.$.lastViewedAt ? parseInt(video.$.lastViewedAt, 10) : null;
    const duration = video.$.duration ? parseInt(video.$.duration, 10) : 0;

    // Calculate watch progress percentage
    const watchProgress = duration > 0 ? Math.min((viewOffset / duration) * 100, 100) : 0;
    const isWatched = viewCount > 0;
    const isPartiallyWatched = !isWatched && viewOffset > 0;

    const parsedItem = {
      id: video.$.ratingKey,
      title: displayTitle,
      originalTitle: video.$.title,
      showTitle: showTitle,
      seasonNumber: seasonNumber,
      episodeNumber: episodeNumber,
      contentType: contentType,
      year: video.$.year,
      thumb: video.$.thumb,
      art: video.$.art,
      grandparentThumb: video.$.grandparentThumb,
      duration: duration,
      addedAt: video.$.addedAt,
      updatedAt: video.$.updatedAt,
      summary: video.$.summary,
      rating: video.$.audienceRating,
      studio: video.$.studio,
      parentRatingKey: video.$.parentRatingKey, // Season ID
      grandparentRatingKey: video.$.grandparentRatingKey, // Show ID
      genre: video.Genre ? (Array.isArray(video.Genre) ? video.Genre.map(g => g.$.tag) : [video.Genre.$.tag]) : [],
      director: video.Director ? (Array.isArray(video.Director) ? video.Director.map(d => d.$.tag) : [video.Director.$.tag]) : [],
      writer: video.Writer ? (Array.isArray(video.Writer) ? video.Writer.map(w => w.$.tag) : [video.Writer.$.tag]) : [],
      actors: video.Role ? (Array.isArray(video.Role) ? video.Role.slice(0, 5).map(r => r.$.tag) : [video.Role.$.tag]) : [],
      filePath: filePath,
      fileSize: fileSize,
      // Watch status fields
      viewCount: viewCount,
      viewOffset: viewOffset,
      lastViewedAt: lastViewedAt,
      watchProgress: watchProgress,
      isWatched: isWatched,
      isPartiallyWatched: isPartiallyWatched,
    };

    // Debug logging for image extraction
    if (contentType === 'episode') {
      console.log(`🎭 Episode parsed: ${parsedItem.title}`);
      console.log(`   thumb: ${parsedItem.thumb}`);
      console.log(`   art: ${parsedItem.art}`);
      console.log(`   grandparentThumb: ${parsedItem.grandparentThumb}`);
    }

    return parsedItem;
  }

  /**
   * Get recently added movies from a Plex server
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {number} limit - Number of items to return (default: 50)
   * @returns {Promise<Array>} Array of recent movies
   */
  async getRecentlyAddedMovies(serverUrl, token, limit = 50) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching recent movies: limit=${limit}`);

      const response = await fetch(`${serverUrl}/library/sections/1/recentlyAdded?limit=${limit}`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const movies = [];

      if (result.MediaContainer && result.MediaContainer.Video) {
        const videoArray = Array.isArray(result.MediaContainer.Video)
          ? result.MediaContainer.Video
          : [result.MediaContainer.Video];

        console.log(`Found ${videoArray.length} movies`);

        for (const video of videoArray) {
          const movie = this.parseVideoItem(video, 'movie');
          movies.push(movie);
        }
      } else {
        console.log('No movies found in response');
      }

      console.log(`Returning ${movies.length} movies`);
      return movies;

    } catch (error) {
      console.error('Error fetching recent movies:', error);
      throw new Error(`Failed to get recent movies: ${error.message}`);
    }
  }

  /**
   * Get recently added TV episodes from a Plex server
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {number} limit - Number of items to return (default: 50)
   * @returns {Promise<Array>} Array of recent TV episodes
   */
  async getRecentlyAddedEpisodes(serverUrl, token, limit = 50) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching recent episodes: limit=${limit}`);

      const response = await fetch(`${serverUrl}/library/sections/2/recentlyAdded?limit=${limit}`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const episodes = [];

      if (result.MediaContainer && result.MediaContainer.Video) {
        const videoArray = Array.isArray(result.MediaContainer.Video)
          ? result.MediaContainer.Video
          : [result.MediaContainer.Video];

        console.log(`Found ${videoArray.length} episodes`);

        for (const video of videoArray) {
          const episode = this.parseVideoItem(video, 'episode');
          episodes.push(episode);
        }
      } else {
        console.log('No episodes found in response');
      }

      console.log(`Returning ${episodes.length} episodes`);
      return episodes;

    } catch (error) {
      console.error('Error fetching recent episodes:', error);
      throw new Error(`Failed to get recent episodes: ${error.message}`);
    }
  }

  /**
   * Get all episodes in a specific season
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {string} seasonId - Season rating key
   * @returns {Promise<Array>} Array of all episodes in the season
   */
  async getSeasonEpisodes(serverUrl, token, seasonId) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching all episodes for season: ${seasonId}`);

      const response = await fetch(`${serverUrl}/library/metadata/${seasonId}/children`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const episodes = [];

      if (result.MediaContainer && result.MediaContainer.Video) {
        const videoArray = Array.isArray(result.MediaContainer.Video)
          ? result.MediaContainer.Video
          : [result.MediaContainer.Video];

        console.log(`Found ${videoArray.length} episodes in season ${seasonId}`);

        for (const video of videoArray) {
          const episode = this.parseVideoItem(video, 'episode');
          episodes.push(episode);
        }
      }

      return episodes;

    } catch (error) {
      console.error('Error fetching season episodes:', error);
      throw new Error(`Failed to get season episodes: ${error.message}`);
    }
  }

  /**
   * Get recently added TV seasons from a Plex server (complete seasons, not just recent episodes)
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {number} limit - Number of seasons to return (default: 20)
   * @returns {Promise<Array>} Array of recent TV seasons with ALL episode data
   */
  async getRecentlyAddedSeasons(serverUrl, token, limit = 20) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching recent complete seasons: limit=${limit}`);

      // First, get recently added episodes to find active shows/seasons
      const response = await fetch(`${serverUrl}/library/sections/2/recentlyAdded?limit=${limit * 3}`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const recentEpisodes = [];

      if (result.MediaContainer && result.MediaContainer.Video) {
        const videoArray = Array.isArray(result.MediaContainer.Video)
          ? result.MediaContainer.Video
          : [result.MediaContainer.Video];

        console.log(`Found ${videoArray.length} recent episodes`);

        for (const video of videoArray) {
          const episode = this.parseVideoItem(video, 'episode');
          recentEpisodes.push(episode);
        }
      }

      // Extract unique show+season combinations from recent episodes
      const seasonMap = new Map();

      for (const episode of recentEpisodes) {
        const seasonKey = `${episode.showTitle}:::${episode.seasonNumber}`;
        const seasonId = episode.parentRatingKey; // This should be the season's rating key

        if (!seasonMap.has(seasonKey)) {
          seasonMap.set(seasonKey, {
            id: seasonKey,
            seasonId: seasonId,
            showTitle: episode.showTitle,
            seasonNumber: episode.seasonNumber,
            art: episode.art, // Use show's poster
            thumb: episode.thumb,
            addedAt: episode.addedAt,
            updatedAt: episode.updatedAt,
            year: episode.year
          });
        }
      }

      // For each unique season, fetch ALL episodes
      const seasons = [];
      const seasonKeys = Array.from(seasonMap.keys());

      for (let i = 0; i < Math.min(seasonKeys.length, limit); i++) {
        const seasonKey = seasonKeys[i];
        const seasonInfo = seasonMap.get(seasonKey);

        try {
          console.log(`Fetching complete season: ${seasonInfo.showTitle} S${seasonInfo.seasonNumber}`);
          const allEpisodes = await this.getSeasonEpisodes(serverUrl, token, seasonInfo.seasonId);

          seasons.push({
            ...seasonInfo,
            episodes: allEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber),
            episodeCount: allEpisodes.length,
            totalSize: allEpisodes.reduce((sum, ep) => sum + (ep.fileSize || 0), 0)
          });

        } catch (error) {
          console.error(`Failed to fetch complete season ${seasonKey}:`, error);
          // Fallback: use just the recent episodes for this season
          const seasonEpisodes = recentEpisodes.filter(ep =>
            ep.showTitle === seasonInfo.showTitle && ep.seasonNumber === seasonInfo.seasonNumber
          );

          seasons.push({
            ...seasonInfo,
            episodes: seasonEpisodes.sort((a, b) => a.episodeNumber - b.episodeNumber),
            episodeCount: seasonEpisodes.length,
            totalSize: seasonEpisodes.reduce((sum, ep) => sum + (ep.fileSize || 0), 0)
          });
        }
      }

      // Sort by most recent episode added
      seasons.sort((a, b) => {
        const latestA = Math.max(...a.episodes.map(e => parseInt(e.addedAt || 0)));
        const latestB = Math.max(...b.episodes.map(e => parseInt(e.addedAt || 0)));
        return latestB - latestA;
      });

      console.log(`Returning ${seasons.length} complete seasons`);
      return seasons;

    } catch (error) {
      console.error('Error fetching recent complete seasons:', error);
      throw new Error(`Failed to get recent seasons: ${error.message}`);
    }
  }

  /**
   * Get library sections from a Plex server
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @returns {Promise<Array>} Array of library sections
   */
  async getLibrarySections(serverUrl, token) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      const response = await fetch(`${serverUrl}/library/sections`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      if (result.MediaContainer && result.MediaContainer.Directory) {
        const directoryArray = Array.isArray(result.MediaContainer.Directory)
          ? result.MediaContainer.Directory
          : [result.MediaContainer.Directory];

        return directoryArray.map(section => ({
          id: section.$.key,
          title: section.$.title,
          type: section.$.type,
          agent: section.$.agent,
          scanner: section.$.scanner,
          language: section.$.language,
          uuid: section.$.uuid,
        }));
      }

      return [];
    } catch (error) {
      console.error('Error fetching library sections:', error);
      throw new Error(`Failed to get library sections: ${error.message}`);
    }
  }

  /**
   * Search for content in a Plex library
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {string} query - Search query
   * @param {string} sectionId - Library section ID (optional)
   * @returns {Promise<Array>} Search results
   */
  async searchContent(serverUrl, token, query, sectionId = null) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };

      // If a specific section is requested, search only in that section
      if (sectionId) {
        // Get the library type for the specific section
        const libraries = await this.getLibrarySections(serverUrl, token);
        const library = libraries.find(lib => lib.id === sectionId);
        if (!library) {
          throw new Error(`Library section ${sectionId} not found`);
        }
        return await this.searchInLibrary(serverUrl, token, sectionId, library.type, query);
      }

      // Otherwise, search across all libraries
      console.log(`Searching for "${query}" across all libraries`);

      // First, get all library sections
      const libraries = await this.getLibrarySections(serverUrl, token);
      console.log(`Found ${libraries.length} libraries to search`);

      let allResults = [];

      // Search in each library
      for (const library of libraries) {
        try {
          console.log(`Searching in library: ${library.title} (ID: ${library.id})`);
          const libraryResults = await this.searchInLibrary(serverUrl, token, library.id, library.type, query);
          console.log(`Found ${libraryResults.length} results in ${library.title}`);
          allResults.push(...libraryResults);
        } catch (error) {
          console.error(`Error searching in library ${library.title}:`, error.message);
          // Continue with other libraries
        }
      }

      // Process TV shows to create season and show entries
      const processedResults = await this.processTVSearchResults(serverUrl, token, allResults);

      // Remove duplicates based on ratingKey and sort results
      const uniqueResults = processedResults.filter((item, index, self) =>
        index === self.findIndex(other => other.id === item.id)
      );

      // Sort results: shows first, then seasons, then episodes (grouped by show)
      const sortedResults = this.sortSearchResults(uniqueResults);

      console.log(`Total unique search results found: ${sortedResults.length}`);
      return sortedResults;

    } catch (error) {
      console.error('Error searching content:', error);
      throw new Error(`Failed to search content: ${error.message}`);
    }
  }

  /**
   * Process TV search results to add season and show entries
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {Array} results - Raw search results
   * @returns {Promise<Array>} Processed results with seasons and shows
   */
  async processTVSearchResults(serverUrl, token, results) {
    const processedResults = [...results];
    const showMap = new Map();

    // Group episodes by show
    for (const result of results) {
      if (result.contentType === 'episode' && result.showTitle && result.grandparentRatingKey) {
        const showId = result.grandparentRatingKey;
        if (!showMap.has(showId)) {
          showMap.set(showId, {
            id: showId,
            title: result.showTitle,
            art: result.art,
            thumb: result.grandparentThumb,
            year: result.year,
            seasons: new Map()
          });
        }

        const show = showMap.get(showId);
        const seasonKey = `${showId}_S${result.seasonNumber}`;
        if (!show.seasons.has(seasonKey)) {
          show.seasons.set(seasonKey, {
            id: seasonKey,
            seasonId: result.parentRatingKey,
            showTitle: result.showTitle,
            seasonNumber: result.seasonNumber,
            art: result.art,
            thumb: result.thumb,
            episodes: []
          });
        }

        show.seasons.get(seasonKey).episodes.push(result);
      }
    }

    // Create season and show entries for each show
    for (const [showId, showData] of showMap) {
      try {
        // Get all seasons for this show
        const allSeasons = await this.getShowSeasons(serverUrl, token, showId);

        // Create season entries
        for (const season of allSeasons) {
          const seasonEntry = this.createSeasonEntry(season, showData);
          processedResults.push(seasonEntry);
        }

        // Create full show entry
        const showEntry = this.createShowEntry(showData, allSeasons);
        processedResults.push(showEntry);

      } catch (error) {
        console.error(`Error processing show ${showData.title}:`, error);
        // Continue with other shows
      }
    }

    return processedResults;
  }

  /**
   * Get all seasons for a specific show
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {string} showId - Show rating key
   * @returns {Promise<Array>} Array of seasons with episodes
   */
  async getShowSeasons(serverUrl, token, showId) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      console.log(`Fetching all seasons for show: ${showId}`);

      const response = await fetch(`${serverUrl}/library/metadata/${showId}/children`, { headers });

      if (!response.ok) {
        throw new Error(`Plex API error: ${response.status}`);
      }

      const xmlData = await response.text();
      const parser = new xml2js.Parser({ explicitArray: false });
      const result = await parser.parseStringPromise(xmlData);

      const seasons = [];

      if (result.MediaContainer && result.MediaContainer.Directory) {
        const directoryArray = Array.isArray(result.MediaContainer.Directory)
          ? result.MediaContainer.Directory
          : [result.MediaContainer.Directory];

        for (const directory of directoryArray) {
          if (directory.$.type === 'season') {
            const seasonNumber = directory.$.index ? parseInt(directory.$.index) : 0;

            // Get all episodes for this season
            const episodes = await this.getSeasonEpisodes(serverUrl, token, directory.$.ratingKey);

            seasons.push({
              id: directory.$.ratingKey,
              title: directory.$.title,
              seasonNumber: seasonNumber,
              art: directory.$.art,
              thumb: directory.$.thumb,
              episodes: episodes,
              episodeCount: episodes.length,
              totalSize: episodes.reduce((sum, ep) => sum + (ep.fileSize || 0), 0)
            });
          }
        }
      }

      return seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);

    } catch (error) {
      console.error('Error fetching show seasons:', error);
      throw new Error(`Failed to get show seasons: ${error.message}`);
    }
  }

  /**
   * Create a season entry for search results
   * @param {Object} season - Season data
   * @param {Object} showData - Show data
   * @returns {Object} Season entry
   */
  createSeasonEntry(season, showData) {
    return {
      id: `season_${season.id}`,
      title: `${showData.title} - Season ${season.seasonNumber}`,
      originalTitle: `Season ${season.seasonNumber}`,
      showTitle: showData.title,
      seasonNumber: season.seasonNumber,
      contentType: 'season',
      year: showData.year,
      thumb: season.thumb,
      art: season.art,
      summary: `Season ${season.seasonNumber} of ${showData.title}`,
      episodes: season.episodes,
      episodeCount: season.episodeCount,
      totalSize: season.totalSize,
      // For compatibility with existing code
      filePath: null,
      fileSize: null,
      isWatched: false,
      isPartiallyWatched: false,
      watchProgress: 0
    };
  }

  /**
   * Create a show entry for search results
   * @param {Object} showData - Show data
   * @param {Array} seasons - All seasons for the show
   * @returns {Object} Show entry
   */
  createShowEntry(showData, seasons) {
    const allEpisodes = seasons.flatMap(season => season.episodes);
    const totalSize = seasons.reduce((sum, season) => sum + season.totalSize, 0);
    const totalEpisodes = allEpisodes.length;

    const showEntry = {
      id: `show_${showData.id}`,
      title: showData.title,
      originalTitle: showData.title,
      contentType: 'show',
      year: showData.year,
      thumb: showData.thumb,
      art: showData.art,
      summary: `Complete series: ${totalEpisodes} episodes across ${seasons.length} seasons`,
      seasons: seasons,
      episodes: allEpisodes,
      seasonCount: seasons.length,
      episodeCount: totalEpisodes,
      totalSize: totalSize,
      // For compatibility with existing code
      filePath: null,
      fileSize: null,
      isWatched: false,
      isPartiallyWatched: false,
      watchProgress: 0
    };

    // Debug logging for show creation
    console.log(`🎬 Show entry created: ${showEntry.title}`);
    console.log(`   thumb: ${showEntry.thumb}`);
    console.log(`   art: ${showEntry.art}`);

    return showEntry;
  }

  /**
   * Sort search results: shows first, then seasons, then movies (no individual episodes)
   * @param {Array} results - Search results to sort
   * @returns {Array} Sorted results
   */
  sortSearchResults(results) {
    const showOrder = [];
    const showMap = new Map();

    // Group items by show
    for (const result of results) {
      let showKey;
      if (result.contentType === 'show') {
        showKey = result.title;
      } else if (result.contentType === 'season') {
        showKey = result.showTitle;
      } else if (result.contentType === 'episode') {
        showKey = result.showTitle;
      } else {
        // Movies and other content
        showKey = '__movies__';
      }

      if (!showMap.has(showKey)) {
        showMap.set(showKey, {
          show: null,
          seasons: [],
          episodes: []
        });
        showOrder.push(showKey);
      }

      const group = showMap.get(showKey);
      if (result.contentType === 'show') {
        group.show = result;
      } else if (result.contentType === 'season') {
        group.seasons.push(result);
      } else if (result.contentType === 'episode') {
        group.episodes.push(result);
      } else {
        // Movies go at the end
        if (!showMap.has('__movies__')) {
          showMap.set('__movies__', { show: null, seasons: [], episodes: [] });
          showOrder.push('__movies__');
        }
        showMap.get('__movies__').episodes.push(result);
      }
    }

    // Sort within each group and only include shows, seasons, and movies
    const sortedResults = [];
    for (const showKey of showOrder) {
      const group = showMap.get(showKey);

      // Add show first
      if (group.show) {
        sortedResults.push(group.show);
      }

      // Add seasons sorted by season number
      group.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
      sortedResults.push(...group.seasons);

      // For movies/other content, add them (they're in the episodes array of __movies__)
      if (showKey === '__movies__') {
        sortedResults.push(...group.episodes);
      }
      // Don't add individual episodes for TV shows
    }

    return sortedResults;
  }

  /**
   * Search for content within a specific library
   * @param {string} serverUrl - Plex server URL
   * @param {string} token - Plex token
   * @param {string} sectionId - Library section ID
   * @param {string} libraryType - Library type ('movie', 'show', 'artist')
   * @param {string} query - Search query
   * @returns {Promise<Array>} Search results from this library
   */
  async searchInLibrary(serverUrl, token, sectionId, libraryType, query) {
    try {
      const headers = { ...this.baseHeaders, 'X-Plex-Token': token };
      let searchTypes = [];

      // Map Plex library types to search types
      switch (libraryType) {
        case 'movie':
          searchTypes = [1]; // movies
          break;
        case 'show':
          searchTypes = [2, 4]; // shows and episodes (to get both)
          break;
        case 'artist':
          searchTypes = [8];
          break;
        default:
          console.log(`Unsupported library type: ${libraryType} for section ${sectionId}`);
          return [];
      }

      let libraryResults = [];

      // Search for each type
      for (const searchType of searchTypes) {
        const url = `${serverUrl}/library/search?query=${encodeURIComponent(query)}&type=${searchType}&limit=50`;

        console.log(`Searching in library ${sectionId} (${libraryType}, type=${searchType}): ${url}`);
        const response = await fetch(url, { headers });

        if (!response.ok) {
          console.error(`Plex API error for type ${searchType}: ${response.status}`);
          continue; // Try next type
        }

        const xmlData = await response.text();
        const parser = new xml2js.Parser({ explicitArray: false });
        const result = await parser.parseStringPromise(xmlData);

        if (result.MediaContainer && result.MediaContainer.SearchResult) {
          const searchResults = Array.isArray(result.MediaContainer.SearchResult)
            ? result.MediaContainer.SearchResult
            : [result.MediaContainer.SearchResult];

          console.log(`Found ${searchResults.length} search results for library ${sectionId}, type ${searchType}`);

          for (const searchResult of searchResults) {
            if (searchResult.Video) {
              const video = searchResult.Video;
              const contentType = video.$.type === 'episode' ? 'episode' : 'movie';
              const parsedItem = this.parseVideoItem(video, contentType);
              libraryResults.push(parsedItem);
            } else if (searchResult.Directory && searchResult.Directory.$.type === 'show') {
              // Handle show results
              const show = searchResult.Directory;
              const showItem = this.parseShowItem(show);
              libraryResults.push(showItem);
            } else {
              console.log(`SearchResult missing expected element:`, JSON.stringify(searchResult, null, 2));
            }
          }
        } else {
          console.log(`No SearchResult in response for library ${sectionId}, type ${searchType}`);
        }
      }

      return libraryResults;

    } catch (error) {
      console.error(`Error searching in library ${sectionId}:`, error);
      throw error;
    }
  }

  /**
   * Parse a show item from Plex XML
   * @param {Object} directory - Directory XML object for show
   * @returns {Object} Parsed show item
   */
  parseShowItem(directory) {
    return {
      id: directory.$.ratingKey,
      title: directory.$.title,
      originalTitle: directory.$.title,
      contentType: 'show',
      year: directory.$.year,
      thumb: directory.$.thumb,
      art: directory.$.art,
      summary: directory.$.summary,
      // For compatibility with existing code
      filePath: null,
      fileSize: null,
      isWatched: false,
      isPartiallyWatched: false,
      watchProgress: 0
    };
  }
}

// Export singleton instance
export default new PlexService();
