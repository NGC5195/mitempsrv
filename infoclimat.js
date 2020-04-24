const v8 = require('v8')
const asyncRedis = require('async-redis')

const redisClient = asyncRedis.createClient()
"use strict"

const precise = (x) => Number.parseFloat(x).toPrecision(2)

const smembers = async (key) => {
    const values = await redisClient.smembers(key)
    return values
}

const gettemphum = async (field) => {
    const temp = await redisClient.hget('temp', field)
    const hum = await redisClient.hget('hum', field)
    return { temp, hum }
}

const getData = () => {
    var request = require('xhr-request')
    request('http://www.infoclimat.fr/public-api/gfs/json?_ll=48.9891224,0.7801129&_auth=VU8DFFMtVXdTflZhUyVQeQVtATRZLwEmUy8GZQ1oUi9TOQBjAGtWNVQ6WyYEKws%2FUn8AZwg%2FAzoBYFUzXy0Df1U1A2dTM1U%2FUz9WNlNhUHsFKQF8WWcBJlMvBmkNZFIvUzIAZABkVipUOVs4BDcLIVJgAGgIPgMkAX1VM183A2hVMQNjUzBVNlM1VjxTZFB7BSkBZFkzATBTZAY1DWVSMVMzAGcAa1YzVDxbOQQ9CyFSYABpCDcDOQFlVTNfMQNhVSkDeFNJVURTIVZ0UyFQMQVwAXxZMwFnU2Q%3D&_c=7a9fd6c8622720cb15b71b1c00dcb792',
        {
            json: true
        },
        (err, data) => {
            if (err) throw err
            if (data.message == "OK" && data.request_state == "200") {
                Object.keys(data).forEach((key) => {
                    const obj = data[key];
                    if (obj.hasOwnProperty('temperature')) {
                        const year = key.substr(0, 4)
                        const month = key.substr(5, 2)
                        const day = key.substr(8, 2)
                        const hour = key.substr(11, 2)
                        const datetime = `${month}/${day}/${year} ${hour}`
                        const temp = precise(obj.temperature['2m'] - 273.15)
                        const hum = precise(obj.humidite['2m'])

                        console.log(`${datetime} : ${temp}`)
                    }
                })
            }
            console.log('done.')
            process.exit(0);
        })
}

getData()
