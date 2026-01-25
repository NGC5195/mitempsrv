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
  const values = await redisClient.smembers(key)
  return values
}

// Convert datetime string "MM/DD/YYYY-HH" to Unix timestamp
const dateTimeToTimestamp = (dtStr) => {
  const [datePart, hour] = dtStr.split('-')
  const [month, day, year] = datePart.split('/')
  return new Date(year, month - 1, day, parseInt(hour)).getTime()
}

// Convert Unix timestamp back to datetime string "MM/DD/YYYY-HH"
const timestampToDateTime = (ts) => {
  const d = new Date(ts)
  return `${pad02(d.getMonth() + 1)}/${pad02(d.getDate())}/${d.getFullYear()}-${pad02(d.getHours())}`
}

// Get datetime keys for a specific time range (last N hours + forecast hours)
// Uses sampling for long periods to reduce data points
const getDateTimeRange = (depthHours, forecastHours) => {
  const now = new Date()
  now.setMinutes(0, 0, 0) // Round to current hour
  
  const totalHours = depthHours + forecastHours
  
  // Sampling: reduce data points for long periods
  // <= 72h: every hour (max 72 points)
  // <= 168h (week): every 2 hours (max 84 points)  
  // > 168h (month): every 4 hours (max 168 points)
  let step = 1
  if (totalHours > 168) step = 4
  else if (totalHours > 72) step = 2
  
  const result = []
  for (let h = -depthHours; h <= forecastHours; h += step) {
    const d = new Date(now.getTime() + h * 3600000)
    result.push(`${pad02(d.getMonth() + 1)}/${pad02(d.getDate())}/${d.getFullYear()}-${pad02(d.getHours())}`)
  }
  return result
}

// Batch fetch data in chunks to avoid overwhelming Pi Zero
const CHUNK_SIZE = 50 // Process 50 keys at a time

const batchGetTempHum = async (keys) => {
  if (keys.length === 0) return []
  
  const results = []
  
  // Process in chunks to avoid memory/CPU issues on Pi Zero
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunk = keys.slice(i, i + CHUNK_SIZE)
    const pipeline = redisClient.batch()
    chunk.forEach(key => pipeline.hgetall(key))
    
    const chunkResults = await new Promise((resolve, reject) => {
      pipeline.exec((err, res) => {
        if (err) reject(err)
        else resolve(res)
      })
    })
    
    results.push(...chunkResults.map(r => r || { temp: null, hum: null, rain: null }))
  }
  
  return results
}

// Cache device info (colors, labels) - they rarely change
let deviceInfoCache = null
let deviceInfoCacheTime = 0
const DEVICE_CACHE_TTL = 60000 // 1 minute

// Response cache - cache full API responses for 5 minutes
const responseCache = new Map()
const RESPONSE_CACHE_TTL = 300000 // 5 minutes

const getCacheKey = (depth, forecast, device) => `${depth}-${forecast}-${device}`

const getCachedResponse = (depth, forecast, device) => {
  const key = getCacheKey(depth, forecast, device)
  const cached = responseCache.get(key)
  if (cached && Date.now() - cached.time < RESPONSE_CACHE_TTL) {
    return cached.data
  }
  return null
}

const setCachedResponse = (depth, forecast, device, data) => {
  const key = getCacheKey(depth, forecast, device)
  responseCache.set(key, { data, time: Date.now() })
  // Clean old entries (keep max 20)
  if (responseCache.size > 20) {
    const oldest = responseCache.keys().next().value
    responseCache.delete(oldest)
  }
}

const getCachedDeviceInfo = async (deviceId) => {
  const now = Date.now()
  if (!deviceInfoCache || now - deviceInfoCacheTime > DEVICE_CACHE_TTL) {
    const devices = await redisClient.smembers('devices')
    const pipeline = redisClient.batch()
    devices.forEach(dv => pipeline.hgetall(dv))
    
    deviceInfoCache = await new Promise((resolve, reject) => {
      pipeline.exec((err, results) => {
        if (err) reject(err)
        else {
          const cache = {}
          devices.forEach((dv, i) => {
            cache[dv] = results[i] || {}
          })
          resolve(cache)
        }
      })
    })
    deviceInfoCacheTime = now
  }
  return deviceInfoCache[deviceId] || {}
}

const deviceInfo = async () => {
  const devices = await redisClient.smembers('devices')
  return Promise.all(devices.map(async (x) => {
    const label = await redisClient.hget(x, 'label')
    return { id: x, label: label }
  }))
}

const formatDateTime = (str) => {
  const time = str.split('-');
  const date = time[0].split('/');
  return date[1] + '/' + date[0] + '/' + date[2] + ' ' + time[1] + 'h'
}

const loadDataFromRedis = async (depth, forecast, device, callback) => {
  // Check response cache first (instant response for repeated queries)
  const cached = getCachedResponse(depth, forecast, device)
  if (cached) {
    console.log(`Cache hit for depth=${depth}, forecast=${forecast}, device=${device}`)
    return callback(cached)
  }
  
  console.log(`Cache miss - fetching from Redis: depth=${depth}, forecast=${forecast}, device=${device}`)
  const startTime = Date.now()
  
  const tempDevices = await smembers("devices")
  
  // Filter devices
  const filteredDevices = tempDevices.filter((x) => device === 'All' || device == x)

  // Generate only the datetime range we need (with sampling for long periods)
  const tempDateTimeFiltered = getDateTimeRange(depth, forecast)
  console.log(`Fetching ${tempDateTimeFiltered.length} time points for ${filteredDevices.length} devices = ${tempDateTimeFiltered.length * filteredDevices.length} keys`)

  const getMinMax = (data, currIdx) => {
    return data.reduce((acc, curr) => curr.concat(acc)).map((x) => {
      var label = x.label.replace(/Temp:/gi, '&#127777;').replace(/Pluie:/gi, '&#x1F327;').replace(/Hum:/gi, '&#x1F4A7;')
      return {
        label: label,
        min: Math.min.apply(Math, x.data.filter((x)=>x)),
        max: Math.max.apply(Math, x.data.filter((x)=>x)),
        curr: x.data[currIdx]
      }
    })
  }

  // Build all keys we need to fetch (datetime-device combinations)
  const allKeys = []
  const keyMap = [] // Track which key belongs to which device
  filteredDevices.forEach(dv => {
    tempDateTimeFiltered.forEach(dt => {
      allKeys.push(`${dt}-${dv}`)
      keyMap.push({ device: dv, datetime: dt })
    })
  })

  // Single batch fetch for ALL data points (1 Redis roundtrip instead of 1500+)
  const allData = await batchGetTempHum(allKeys)

  // Organize data by device
  const dataByDevice = {}
  filteredDevices.forEach(dv => { dataByDevice[dv] = [] })
  
  allData.forEach((data, i) => {
    const { device } = keyMap[i]
    dataByDevice[device].push({
      temp: data.temp,
      hum: data.hum,
      rain: data.rain
    })
  })

  // Build chart datasets (device info is cached)
  const allDatasets = await Promise.all(filteredDevices.map(async (dv) => {
    const deviceInfo = await getCachedDeviceInfo(dv)
    const data = dataByDevice[dv]
    
    let dateforChar = [{
      label: 'Temp: ' + deviceInfo.label,
      fill: false,
      borderColor: deviceInfo.tempColor,
      data: data.map(o => o.temp),
      yAxisID: 'right-y-axis'
    },
    {
      label: 'Hum: ' + deviceInfo.label,
      fill: false,
      borderColor: deviceInfo.humColor,
      data: data.map(o => o.hum),
      yAxisID: 'left-y-axis'
    }]
    
    if (dv == 'infoclimat1') {
      dateforChar.push({
        label: 'Pluie: ' + deviceInfo.label,
        fill: false,
        data: data.map(o => o.rain),
        yAxisID: 'right-y-axis',
        type: "bar"
      })
    }
    return dateforChar
  }))

  const message = {
    chartdata: {
      labels: tempDateTimeFiltered.map(x => formatDateTime(x)),
      datasets: allDatasets.reduce((acc, curr) => curr.concat(acc)),
      borderWidth: 1
    },
    summary: getMinMax(allDatasets, depth),
    timestamp: tempDateTimeFiltered.map(x => formatDateTime(x))[depth]
  }
  
  // Cache the response for next time
  setCachedResponse(depth, forecast, device, message)
  console.log(`Redis fetch completed in ${Date.now() - startTime}ms`)
  
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
  loadDataFromRedis(parseInt(req.query.depth), parseInt(req.query.forecast),req.query.device, (message) => {
    sendJsonString(JSON.stringify(message), req, res)
  })
})

app.get('/rasp/summary', (req, res) => {
  loadDataFromRedis(parseInt(req.query.depth), parseInt(req.query.forecast),req.query.device, (message) => {
    res.type('text/html')
    var innerHTML = "summary"
    // message.summary
    res.send(innerHTML)
  })
})

app.get('/rasp/devices', (req, res) => {
  deviceInfo().then((dvlist) => {
    const devices = dvlist.map((dv) => {
      return {id: dv.id, label: dv.label}
    })
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
