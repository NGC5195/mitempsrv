const v8 = require('v8');
const asyncRedis = require('async-redis');
const redisClient = asyncRedis.createClient();
"use strict"

function showMemoryUsage() {
  console.log(' >used heap size:' + (v8.getHeapStatistics().used_heap_size / 1024 / 1024).toFixed(2) + ' Mo - heap size limit: ' + (v8.getHeapStatistics().heap_size_limit / 1024 / 1024).toFixed(2) + ' Mo ' + (v8.getHeapStatistics().used_heap_size / v8.getHeapStatistics().heap_size_limit * 100).toFixed(2) + '%')
}

String.prototype.toCamelCase = function () {
  if (this.length == 2) {
    return this
  } else {
    return this.replace(/(?:^\w|[A-Z]|\b\w)/g, function (letter, index) {
      return index == 0 ? letter.toUpperCase() : letter.toLowerCase()
    }).replace(/\s+/g, '')
  }
}

function IsJsonString(str) {
  try {
    JSON.parse(str)
  } catch (e) {
    return false
  }
  return true
}

function sendJsonString(jsonString, req, res) {
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

const gettemphum = async (field) => {
  const temp = await redisClient.hget('temp', field)
  const hum = await redisClient.hget('hum', field)
  return {temp, hum}
}

const loadDataFromRedis = async (req, res) => {
  const tempDevices = await smembers("devices")
  const tempDateTime = await smembers("datetime")

  const tempDateTimeSorted = tempDateTime.sort( (a, b) => {
    const adate = a.split('/');
    const atime = a.split('-');
    const aa = adate[2]+adate[0]+adate[1]+atime[1]
    const bdate = b.split('/');
    const btime = b.split('-');
    const bb = bdate[2]+bdate[0]+bdate[1]+btime[1]
    return aa.localeCompare(bb);;
  });

  Promise.all(tempDevices.map((dv) => { 
    return Promise.all(tempDateTimeSorted.map((dt) => { 
      return gettemphum(dt+'-'+dv).then((val) => { 
        return val
      });
    })).then((temperatures) => {
        return [{
          label: 'Temp: '+dv,
          fill: false,
          borderColor: 'green',
          data: temperatures.map(o=>o.temp)
        },
        {
          label: 'Hum: '+dv,
          fill: false,
          borderColor: 'blue',
          data: temperatures.map(o=>o.hum)
        }]
    })
  })).then((alldata) => {
    const message = {
      labels: tempDateTime,
      datasets: alldata.reduce(x=>x),
      borderWidth: 1
    }    
    sendJsonString(JSON.stringify(message), req, res)
  })
}

//----------------------------------------------------------------------------------------
// HTTP Server routines
//----------------------------------------------------------------------------------------
var express = require('express')
var app = express()
var favicon = require('serve-favicon')
var session = require('express-session')({
  secret: "albAtr-0s",
  resave: true,
  saveUninitialized: true
})
app.set('port', process.env.PORT || 3000)
app.use(express.static(__dirname + '/themes/default'))
app.use(express.static(__dirname + '/.'))
app.use(session)
app.use(favicon(__dirname + '/icon.png'))

// service to load next level of the WATS tree on AJAX request
app.get('/data', function (req, res) {
  loadDataFromRedis(req, res)
})

app.use(function (req, res) {
  res.type('text/plain')
  res.status('404')
  res.send('404 - Not Found')
})


const server  = require("http").createServer(app);
// http listener
server.listen(app.get('port'), function (req, res) {
  console.log('----- ' + new Date)
  console.log('Server started on [http://127.0.0.1:' + app.get('port') + '/chart.html] - Press Ctrl+C to terminate.')
  showMemoryUsage()
})

redisClient.on('error', function (err) {
  console.log('Something went wrong with Redis' + err);
});