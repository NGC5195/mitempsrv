const v8 = require('v8')
const asyncRedis = require('async-redis')
const redisClient = asyncRedis.createClient()
"use strict"

const precise = (x) => Math.round((x + Number.EPSILON) * 100) / 100
const pad02 = (x) => x.toFixed(0).padStart(2, '0')

const getData = () => {
    var request = require('xhr-request')

    const asyncsadd = async (key, value) => {
        return await redisClient.sadd(key, value)
    }
    const asynchset = async (key, field, value) => {
        return await redisClient.hset(key, field, value)
    }
    
    const suresne = '48.8687162,2.2044489'
    const ajou = '48.9891224,0.7801129'
    request(`http://www.infoclimat.fr/public-api/gfs/json?_ll=${ajou}&_auth=VU8DFFMtVXdTflZhUyVQeQVtATRZLwEmUy8GZQ1oUi9TOQBjAGtWNVQ6WyYEKws%2FUn8AZwg%2FAzoBYFUzXy0Df1U1A2dTM1U%2FUz9WNlNhUHsFKQF8WWcBJlMvBmkNZFIvUzIAZABkVipUOVs4BDcLIVJgAGgIPgMkAX1VM183A2hVMQNjUzBVNlM1VjxTZFB7BSkBZFkzATBTZAY1DWVSMVMzAGcAa1YzVDxbOQQ9CyFSYABpCDcDOQFlVTNfMQNhVSkDeFNJVURTIVZ0UyFQMQVwAXxZMwFnU2Q%3D&_c=7a9fd6c8622720cb15b71b1c00dcb792`,
        {
            json: true
        },
        (err, data) => {
            var dataArray = []
            const device = 'infoclimat1'
            if (err) throw err
            if (data.message == "OK" && data.request_state == "200") {
                Object.keys(data).forEach((key) => {
                    const obj = data[key];
                    if (obj.hasOwnProperty('temperature')) {
                        dataArray.push(
                            {
                                year: key.substr(0, 4),
                                month: key.substr(5, 2),
                                day: key.substr(8, 2),
                                hour: key.substr(11, 2),
                                temp: precise(obj.temperature['2m'] - 273.15),
                                hum: precise(obj.humidite['2m']),
                                rain: precise(obj.pluie / 3)
                            }
                        )
                    }
                })
                dataArray.map((curr, idx, array) => {
                    if (idx == 0) {
                        return curr
                    } else {
                        var arr2 = []
                        arr2.push(
                            {
                                year: curr.year,
                                month: curr.month,
                                day: curr.hour-2<0?curr.day-1:curr.day,
                                hour: curr.hour-2<0?23:pad02(curr.hour-2),
                                temp: precise(array[idx-1].temp + ((array[idx].temp - array[idx-1].temp)/3)),
                                hum: precise(array[idx-1].hum + ((array[idx].hum - array[idx-1].hum)/3)),
                                rain: precise(array[idx].rain),
                            }
                        )
                        arr2.push(
                            {
                                year: curr.year,
                                month: curr.month,
                                day: curr.day,
                                hour: pad02(curr.hour-1),
                                temp: precise(array[idx-1].temp + ((array[idx].temp - array[idx-1].temp)/3*2)),
                                hum: precise(array[idx-1].hum + ((array[idx].hum - array[idx-1].hum)/3*2)),
                                rain: precise(array[idx].rain),
                            }
                        )
                        arr2.push(curr)
                        return arr2
                    }
                }).reduce((acc,curr)=>curr.concat(acc)).forEach((x) => {
                    const datetime = `${x.month}/${x.day}/${x.year}-${x.hour}`
                    // console.log(`${datetime} ${x.temp}`)
                    asyncsadd("devices", device).then()
                    asyncsadd("datetime", datetime).then()
                    asynchset(datetime+'-'+device, 'temp', x.temp).then()
                    asynchset(datetime+'-'+device, 'hum', x.hum).then()
                    asynchset(datetime+'-'+device, 'rain', x.rain).then()
                })
            }
            asynchset(device, 'tempColor', 'rgb(221, 255, 153)').then()
            asynchset(device, 'humColor', 'rgb(204, 221, 255)').then()
            asynchset(device, 'label', 'Prévision Ajou').then()
            asynchset('58:2d:34:39:77:eb', 'tempColor', 'green').then()
            asynchset('58:2d:34:39:77:eb', 'humColor', 'blue').then()
            asynchset('58:2d:34:39:77:eb', 'label', 'Etage').then()

            asynchset('58:2d:34:3a:d2:7e', 'tempColor', 'green').then()
            asynchset('58:2d:34:3a:d2:7e', 'humColor', 'blue').then()
            asynchset('58:2d:34:3a:d2:7e', 'label', 'RDC').then()

            asynchset('58:2d:34:3a:d2:37', 'tempColor', 'rgb(204, 204, 0)').then()
            asynchset('58:2d:34:3a:d2:37', 'humColor', 'rgb(153, 0, 153)').then()
            asynchset('58:2d:34:3a:d2:37', 'label', 'Extérieur').then()

            var today = new Date()
            console.log('done - '+today.toLocaleString())
            process.exit(0);
        })
}

redisClient.on('error', function (err) {
    console.log('Something went wrong with Redis' + err);
});

getData()
