const v8 = require('v8')
const asyncRedis = require('async-redis')
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

const gettemphum = async (key) => {
  const temp = await redisClient.hget(key, 'temp')
  const hum = await redisClient.hget(key, 'hum')
  const rain = await redisClient.hget(key, 'rain')
  return { temp, hum, rain }
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
  const tempDevices = await smembers("devices")
  const tempDateTime = await smembers("datetime")

  const filteredDevices = tempDevices.filter((x) => {
    if (device === 'All' || device == x) {
      return 1
    } else {
      return 0
    }
  })

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

  var tempDateTimeSorted = tempDateTime.sort((a, b) => {
    const atime = a.split('-');
    const adate = atime[0].split('/');
    const aa = adate[2] + adate[0] + adate[1] + atime[1]
    const btime = b.split('-');
    const bdate = btime[0].split('/');
    const bb = bdate[2] + bdate[0] + bdate[1] + btime[1]
    return aa.localeCompare(bb);;
  });

  const d = new Date();
  const current = `${pad02(d.getMonth()+1)}/${pad02(d.getDate())}/${d.getFullYear()}-${pad02(d.getHours())}`
  const currentIndex = tempDateTimeSorted.findIndex(element => element == current);

  if (currentIndex+forecast > tempDateTimeSorted.length) {
    forecast = tempDateTimeSorted.length - currentIndex
  }
  
  if (currentIndex-depth < 0) {
    depth = currentIndex
  }

  var tempDateTimeFiltered = []
  for (let i = 0; i < tempDateTimeSorted.length; i++) {
    if ((i >= currentIndex-depth) && (i <= currentIndex+forecast)) {
      tempDateTimeFiltered.push(tempDateTimeSorted[i])
    }
  }

  Promise.all(filteredDevices.map((dv) => {
    return Promise.all(tempDateTimeFiltered.map((dt) => {
      return gettemphum(dt + '-' + dv).then((val) => {
        return val
      });
    })).then(async (data) => {
      const tempColor = await redisClient.hget(dv, 'tempColor')
      const humColor = await redisClient.hget(dv, 'humColor')
      const label = await redisClient.hget(dv, 'label')
      let dateforChar = [{
        label: 'Temp: ' + label,
        fill: false,
        borderColor: tempColor,
        data: data.map(o => o.temp),
        yAxisID: 'right-y-axis'
      },
      {
        label: 'Hum: ' + label,
        fill: false,
        borderColor: humColor,
        data: data.map(o => o.hum),
        yAxisID: 'left-y-axis'
      }];
      if (dv == 'infoclimat1') {
        dateforChar.push(
          {
            label: 'Pluie: ' + label,
            fill: false,
            // borderColor: 'Blue',
            data: data.map(o => o.rain),
            yAxisID: 'right-y-axis',
            type: "bar"
          }          
        )
      }
      return dateforChar;
    })
  })).then((alldata) => {
    const message = {
      chartdata: {
        labels: tempDateTimeFiltered.map(x => formatDateTime(x)),
        datasets: alldata.reduce((acc, curr) => curr.concat(acc)),
        borderWidth: 1
      },
      summary: getMinMax(alldata, depth),
      timestamp: tempDateTimeFiltered.map(x => formatDateTime(x))[depth]
    }
    callback(message)
  })
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
app.use('/rasp', express.static(__dirname + '/css/'))
app.use('/rasp', express.static(__dirname + '/dist/'))
app.use('/rasp', express.static(__dirname + '/.'))
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
