// Debugin
// sudo journalctl -u mitemp.service -f
// tail -f /var/log/nginx/error.log
// sudo systemctl restart nginx
// sudo systemctl restart mitemp.service

const v8 = require('v8')
const asyncRedis = require('async-redis')
const compression = require('compression')
const redisClient = asyncRedis.createClient()
"use strict"

const showMemoryUsage = () => console.log(' >used heap size:' + (v8.getHeapStatistics().used_heap_size / 1024 / 1024).toFixed(2) + ' Mo - heap size limit: ' + (v8.getHeapStatistics().heap_size_limit / 1024 / 1024).toFixed(2) + ' Mo ' + (v8.getHeapStatistics().used_heap_size / v8.getHeapStatistics().heap_size_limit * 100).toFixed(2) + '%')

const pad02 = (x) => x.toFixed(0).padStart(2, '0')

const IsJsonString = (str) => {
  try {
    JSON.parse(str)
  } catch (e) {
    return false
  }
  return true
}

const sendJsonString = (jsonString, req, res) => {
  res.type('application/json')
  res.status('200')
  if (IsJsonString(jsonString)) {
    // console.log('JSON: ' + jsonString)
    res.send(jsonString)
  } else {
    console.log('JSON malformed: ' + jsonString)
    res.send('[]')
  }
}

const smembers = async (key) => {
  console.log(`[Redis] SMEMBERS ${key}`)
  const values = await redisClient.smembers(key)
  console.log(`[Redis] SMEMBERS ${key} -> ${values.length} members`)
  return values
}

// Get timestamp range for query (depth hours back, forecast hours forward)
// Returns Unix timestamps in SECONDS (not milliseconds) to match Python/Redis
const getTimestampRange = (depthHours, forecastHours) => {
  const now = new Date()
  now.setMinutes(0, 0, 0) // Round to current hour
  
  const nowSeconds = Math.floor(now.getTime() / 1000)
  const startTs = nowSeconds - (depthHours * 3600)
  const endTs = nowSeconds + (forecastHours * 3600)
  
  return { startTs, endTs, currentTs: nowSeconds }
}

// Batch fetch data for multiple devices using pipeline (1 Redis roundtrip for all devices)
const batchGetDeviceData = async (deviceIds, startTs, endTs) => {
  if (deviceIds.length === 0) return {}
  
  console.log(`[Redis] PIPELINE ZRANGEBYSCORE for ${deviceIds.length} devices (${startTs} to ${endTs})`)
  const pipeline = redisClient.batch()
  deviceIds.forEach(deviceId => {
    const key = `device:${deviceId}:data`
    console.log(`[Redis]   - ZRANGEBYSCORE ${key} ${startTs} ${endTs}`)
    pipeline.zrangebyscore(key, startTs, endTs)
  })
  
  return new Promise((resolve, reject) => {
    pipeline.exec((err, results) => {
      if (err) {
        console.log(`[Redis] PIPELINE ERROR: ${err}`)
        reject(err)
      } else {
        const dataByDevice = {}
        deviceIds.forEach((deviceId, i) => {
          const rawData = results[i] || []
          console.log(`[Redis]   - ${deviceId}: ${rawData.length} data points`)
          dataByDevice[deviceId] = rawData.map(jsonStr => {
            try {
              return JSON.parse(jsonStr)
            } catch (e) {
              return { temp: null, hum: null, batt: null, datetime: null }
            }
          })
        })
        console.log(`[Redis] PIPELINE completed`)
        resolve(dataByDevice)
      }
    })
  })
}

// Cache device info (colors, labels) - they rarely change
let deviceInfoCache = null
let deviceInfoCacheTime = 0
const DEVICE_CACHE_TTL = 60000 // 1 minute

const getCachedDeviceInfo = async (deviceId) => {
  const now = Date.now()
  if (!deviceInfoCache || now - deviceInfoCacheTime > DEVICE_CACHE_TTL) {
    console.log(`[Redis] Refreshing device info cache (TTL expired or first load)`)
    console.log(`[Redis] SMEMBERS devices`)
    const devices = await redisClient.smembers('devices')
    console.log(`[Redis] SMEMBERS devices -> ${devices.length} devices`)
    
    console.log(`[Redis] PIPELINE HGETALL for ${devices.length} devices`)
    const pipeline = redisClient.batch()
    devices.forEach(dv => {
      console.log(`[Redis]   - HGETALL ${dv}`)
      pipeline.hgetall(dv)
    })
    
    deviceInfoCache = await new Promise((resolve, reject) => {
      pipeline.exec((err, results) => {
        if (err) {
          console.log(`[Redis] PIPELINE ERROR: ${err}`)
          reject(err)
        } else {
          const cache = {}
          devices.forEach((dv, i) => {
            cache[dv] = results[i] || {}
            console.log(`[Redis]   - ${dv}: label=${cache[dv].label}`)
          })
          console.log(`[Redis] Device info cache updated`)
          resolve(cache)
        }
      })
    })
    deviceInfoCacheTime = now
  } else {
    console.log(`[Redis] Using cached device info (cache age: ${now - deviceInfoCacheTime}ms)`)
  }
  return deviceInfoCache[deviceId] || {}
}

const deviceInfo = async () => {
  console.log(`[Redis] SMEMBERS devices (for /devices endpoint)`)
  const devices = await redisClient.smembers('devices')
  console.log(`[Redis] SMEMBERS devices -> ${devices.length} devices`)
  return Promise.all(devices.map(async (x) => {
    console.log(`[Redis] HGET ${x} label`)
    const label = await redisClient.hget(x, 'label')
    console.log(`[Redis] HGET ${x} label -> ${label}`)
    return { id: x, label: label }
  }))
}

const loadDataFromRedis = async (depth, forecast, device, callback) => {
  const startTime = Date.now()
  console.log(`[loadData] Starting - depth=${depth}h, forecast=${forecast}h, device=${device}`)
  
  const tempDevices = await smembers("devices")
  
  // Filter devices
  const filteredDevices = tempDevices.filter((x) => device === 'All' || device == x)
  console.log(`[loadData] Filtered devices: ${filteredDevices.length} of ${tempDevices.length}`)

  // Get timestamp range for the query
  const { startTs, endTs, currentTs } = getTimestampRange(depth, forecast)
  console.log(`[loadData] Time range: ${new Date(startTs * 1000).toISOString()} to ${new Date(endTs * 1000).toISOString()}`)

  // Single batch fetch for all devices (1 Redis roundtrip!)
  const dataByDevice = await batchGetDeviceData(filteredDevices, startTs, endTs)

  // Collect all unique timestamps and sort them for chart labels
  const allTimestamps = new Set()
  Object.values(dataByDevice).forEach(dataPoints => {
    dataPoints.forEach(dp => {
      if (dp.datetime) {
        // Parse datetime string to get timestamp for sorting
        const ts = new Date(dp.datetime).getTime()
        if (!isNaN(ts)) allTimestamps.add(ts)
      }
    })
  })
  const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b)

  // Format timestamps for chart labels (DD/MM/YYYY HHh)
  const formatTimestamp = (ts) => {
    const d = new Date(ts)
    return `${pad02(d.getDate())}/${pad02(d.getMonth() + 1)}/${d.getFullYear()} ${pad02(d.getHours())}h`
  }
  const chartLabels = sortedTimestamps.map(ts => formatTimestamp(ts))

  // Find current index (closest to now) for "current" value display
  // Note: sortedTimestamps are in milliseconds, currentTs is in seconds
  const currentIdx = sortedTimestamps.findIndex(ts => ts >= currentTs * 1000)
  const currIdx = currentIdx >= 0 ? currentIdx : sortedTimestamps.length - 1

  const getMinMax = (data, currIdx) => {
    return data.reduce((acc, curr) => curr.concat(acc)).map((x) => {
      var label = x.label.replace(/Temp:/gi, '&#127777;').replace(/Pluie:/gi, '&#x1F327;').replace(/Hum:/gi, '&#x1F4A7;')
      const validData = x.data.filter(v => v !== null && v !== undefined)
      return {
        label: label,
        min: validData.length > 0 ? Math.min(...validData) : null,
        max: validData.length > 0 ? Math.max(...validData) : null,
        curr: x.data[currIdx]
      }
    })
  }

  // Build chart datasets (device info is cached)
  const allDatasets = await Promise.all(filteredDevices.map(async (dv) => {
    const deviceMeta = await getCachedDeviceInfo(dv)
    const rawData = dataByDevice[dv] || []
    
    // Create a map of timestamp -> data for this device
    const dataMap = new Map()
    rawData.forEach(dp => {
      if (dp.datetime) {
        const ts = new Date(dp.datetime).getTime()
        if (!isNaN(ts)) dataMap.set(ts, dp)
      }
    })

    // Align data to sorted timestamps (fill nulls for missing points)
    const alignedData = sortedTimestamps.map(ts => {
      const dp = dataMap.get(ts)
      return dp || { temp: null, hum: null, batt: null }
    })
    
    let dateforChar = [{
      label: 'Temp: ' + deviceMeta.label,
      fill: false,
      borderColor: deviceMeta.tempColor,
      data: alignedData.map(o => o.temp !== null ? parseFloat(o.temp) : null),
      yAxisID: 'right-y-axis'
    },
    {
      label: 'Hum: ' + deviceMeta.label,
      fill: false,
      borderColor: deviceMeta.humColor,
      data: alignedData.map(o => o.hum !== null ? parseFloat(o.hum) : null),
      yAxisID: 'left-y-axis'
    }]
    
    if (dv == 'infoclimat1') {
      dateforChar.push({
        label: 'Pluie: ' + deviceMeta.label,
        fill: false,
        data: alignedData.map(o => o.rain !== null ? parseFloat(o.rain) : null),
        yAxisID: 'right-y-axis',
        type: "bar"
      })
    }
    return dateforChar
  }))

  const message = {
    chartdata: {
      labels: chartLabels,
      datasets: allDatasets.reduce((acc, curr) => curr.concat(acc)),
      borderWidth: 1
    },
    summary: getMinMax(allDatasets, currIdx),
    timestamp: chartLabels[currIdx] || ''
  }
  
  const duration = Date.now() - startTime
  console.log(`[loadData] Completed in ${duration}ms - ${chartLabels.length} data points, ${allDatasets.length} datasets`)
  callback(message)
}

//----------------------------------------------------------------------------------------
// HTTP Server routines
//----------------------------------------------------------------------------------------
var express = require('express')
var app = express()
var favicon = require('serve-favicon')
// var session = require('express-session')({
//   secret: "albAtr-0s",
//   resave: true,
//   saveUninitialized: true
// })
app.set('port', process.env.PORT || 3000)

// Enable gzip compression for all responses (huge speedup on slow Pi Zero)
app.use(compression())

// Cache static assets for 1 day (86400 seconds) - reduces repeated downloads
const staticOptions = { maxAge: '1d', etag: true }
app.use('/rasp', express.static(__dirname + '/css/', staticOptions))
app.use('/rasp', express.static(__dirname + '/dist/', staticOptions))
app.use('/rasp', express.static(__dirname + '/.', staticOptions))
app.use('/rasp', favicon(__dirname + '/icon.png'))
// app.use(session)

app.get('/rasp/data', (req, res) => {
  console.log(`[HTTP] GET /rasp/data?depth=${req.query.depth}&forecast=${req.query.forecast}&device=${req.query.device}`)
  loadDataFromRedis(parseInt(req.query.depth), parseInt(req.query.forecast),req.query.device, (message) => {
    sendJsonString(JSON.stringify(message), req, res)
  })
})

app.get('/rasp/summary', (req, res) => {
  console.log(`[HTTP] GET /rasp/summary?depth=${req.query.depth}&forecast=${req.query.forecast}&device=${req.query.device}`)
  loadDataFromRedis(parseInt(req.query.depth), parseInt(req.query.forecast),req.query.device, (message) => {
    res.type('text/html')
    var innerHTML = "summary"
    // message.summary
    res.send(innerHTML)
  })
})

app.get('/rasp/devices', (req, res) => {
  console.log(`[HTTP] GET /rasp/devices`)
  deviceInfo().then((dvlist) => {
    const devices = dvlist.map((dv) => {
      return {id: dv.id, label: dv.label}
    })
    console.log(`[HTTP] /rasp/devices -> ${devices.length} devices`)
    sendJsonString(JSON.stringify(devices), req, res)
  })
})

app.use((req, res) => {
  res.type('text/plain')
  res.sendStatus('404')
})


const server = require("http").createServer(app);
// http listener
server.listen(app.get('port'), function (req, res) {
  console.log('----- ' + new Date)
  console.log('Server started on [http://127.0.0.1:' + app.get('port') + '/rasp/meteo.html] - Press Ctrl+C to terminate.')
  showMemoryUsage()
})

redisClient.on('error', function (err) {
  console.log('Something went wrong with Redis' + err);
});
