const fetch = require('node-fetch')
const fs = require('fs')


/**
 * Download a file from a url
 * 
 */
class DownloadManager {
  /**
   * Initialize the download manager
   * @constructor
   * @public
   */
  constructor() {
    this.currentDownloads = {};
    this.scheduledDownloads = {};
  }

  /**
   * Start a file download
   * @param {String} filePath The path to save the file to
   * @param {Object} requestConfig The configuration for the request
   * @param {Object} options The options for the download
   * @returns {Promise} A promise that resolves when the file is downloaded
   * @public
   */
  start(filePath, requestConfig, options) {
    if (options && options.delayInSeconds) {
      return this._delayedStart(filePath, requestConfig, options)
    }

    // Clear scheduled download if it exists
    if (this.currentDownloads[filePath]) {
      clearTimeout(this.currentDownloads[filePath].timeout)
    }

    return new Promise((resolve, reject) => {

      // Const get download from the current downloads
      const download = this.currentDownloads[filePath]

      // Check that download is not older than 30 minutes
      if (download && download.startTime && (Date.now() - download.startTime) > 1800000) {
        // Delete the download
        delete this.currentDownloads[filePath]
        // Remove temporary file
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
        // Reject the promise
        reject('Download is older than 30 minutes')
        return;
      }

      // Check if we're already downloading this file)
      if (download) {
        reject('Duplicate download')
        return;
      }

      // Check if the file already exists in the download directory
      if (fs.existsSync(filePath)) {
        // Delete the file so we can initialize a fresh download
        fs.unlinkSync(filePath)
      }

      // Create the download
      if (options && options.onNewDownload) {
        options.onNewDownload()
      }

      // Insert the download into the current downloads
      this.currentDownloads[filePath] = {
        startTime: Date.now()
      }
      // Start a new download
      const file = fs.createWriteStream(filePath)
      const res = fetch(requestConfig.path, requestConfig)
      res.body.pipe(file)
      res.body.on('error', (err) => {
        // Remove the file from the current downloads
        delete this.currentDownloads[filePath]
        // Remove the file from the filesystem
        fs.unlink(filePath, () => {
          reject(err)
        })
      })
      file.on('finish', () => {
        // Remove the file from the current downloads
        delete this.currentDownloads[filePath]
        resolve(filePath)
      })
    })
  }

  /**
   * Start a download after a delay
   * @param {Object} filePath The path to save the file to
   * @param {Object} requestConfig The configuration for the request
   * @param {Object} options The options for the download
   * @returns {Promise} A promise that resolves when the file is downloaded
   * @private
   */
  _delayedStart(filePath, requestConfig, options) {
    return new Promise((resolve, reject) => {
      if (this.scheduledDownloads[filePath]) {
        reject(`Duplicate download: starting in ${(this.scheduledDownloads[filePath].startTime - Date.now())/1000} seconds`)
        return;
      }
      if (this.currentDownloads[filePath]) {
        reject(`Duplicate download: cannot schedule a download while another is in progress`)
        return;
      }
      const timeout = setTimeout(() => {
        delete options.delayInSeconds
        delete this.scheduledDownloads[filePath]
        this.start(filePath, requestConfig, options).then(resolve).catch(reject)
      }, options.delayInSeconds * 1000)

      this.scheduledDownloads[filePath] = {
        startTime: Date.now() + (options.delayInSeconds * 1000),
        timeout
      }
    })
  }
}

module.exports = DownloadManager