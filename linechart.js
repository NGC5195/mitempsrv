const ctx = document.getElementById('myChart').getContext('2d')
const monthLabel = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// Track current depth for x-axis formatting
let currentDepth = 24

// Sunrise/Sunset cache and configuration
const LOCATION = { lat: 48.9897, lng: 0.7808 } // Your location
const sunDataCache = new Map() // Cache: "YYYY-MM-DD" -> { sunrise: hour, sunset: hour }

// Parse time string "7:31:49 AM" to decimal hours
const parseTimeToHours = (timeStr) => {
    const match = timeStr.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i)
    if (!match) return null
    let [, hours, minutes, seconds, period] = match
    hours = parseInt(hours)
    if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12
    if (period.toUpperCase() === 'AM' && hours === 12) hours = 0
    return hours + parseInt(minutes) / 60 + parseInt(seconds) / 3600
}

// Convert UTC hours to CET/CEST (handles daylight saving time)
const utcToCET = (utcHours, date) => {
    // Create a date object to check if DST is in effect
    const d = new Date(date)
    d.setUTCHours(Math.floor(utcHours))
    
    // CET is UTC+1, CEST (summer) is UTC+2
    // Check if date is in DST (last Sunday of March to last Sunday of October)
    const month = d.getMonth()
    const isDST = month > 2 && month < 9 // April to September is definitely DST
        || (month === 2 && d.getDate() >= 25 && d.getDay() === 0) // End of March
        || (month === 9 && d.getDate() < 25) // Beginning of October
    
    const offset = isDST ? 2 : 1
    let cetHours = utcHours + offset
    if (cetHours >= 24) cetHours -= 24
    return cetHours
}

// Fetch sunrise/sunset for a specific date
const fetchSunData = async (dateStr) => {
    // dateStr format: "YYYY-MM-DD"
    if (sunDataCache.has(dateStr)) {
        return sunDataCache.get(dateStr)
    }
    
    try {
        const url = `https://api.sunrise-sunset.org/json?lat=${LOCATION.lat}&lng=${LOCATION.lng}&date=${dateStr}`
        const response = await fetch(url)
        const data = await response.json()
        
        if (data.status === 'OK') {
            const sunriseUTC = parseTimeToHours(data.results.sunrise)
            const sunsetUTC = parseTimeToHours(data.results.sunset)
            
            const sunData = {
                sunrise: Math.round(utcToCET(sunriseUTC, dateStr)), // Round to nearest hour
                sunset: Math.round(utcToCET(sunsetUTC, dateStr))
            }
            
            sunDataCache.set(dateStr, sunData)
            console.log(`[Sun] ${dateStr}: sunrise=${sunData.sunrise}h, sunset=${sunData.sunset}h (CET)`)
            return sunData
        }
    } catch (e) {
        console.log(`[Sun] Error fetching sun data for ${dateStr}:`, e)
    }
    
    // Fallback to default values
    return { sunrise: 7, sunset: 18 }
}

// Pre-fetch sun data for dates in chart labels
const prefetchSunData = async (labels) => {
    const dates = new Set()
    labels.forEach(label => {
        // Extract date from label "DD/MM/YYYY HHh"
        const match = label.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
        if (match) {
            const [, day, month, year] = match
            dates.add(`${year}-${month}-${day}`)
        }
    })
    
    // Fetch all unique dates (limit to avoid too many API calls)
    const dateArray = Array.from(dates).slice(0, 30)
    await Promise.all(dateArray.map(d => fetchSunData(d)))
}

// Check if an hour is nighttime for a given date
const isNightTime = (hour, dateStr) => {
    const sunData = sunDataCache.get(dateStr) || { sunrise: 7, sunset: 18 }
    return hour < sunData.sunrise || hour >= sunData.sunset
}

// Plugin to draw gray background for nighttime hours (based on sunrise/sunset API)
const nightTimePlugin = {
    id: 'nightTimeBackground',
    beforeDraw: function(chart) {
        const ctx = chart.ctx
        const chartArea = chart.chartArea
        const xAxis = chart.scales['x-axis-0']
        const labels = chart.data.labels || []
        
        if (!chartArea || !xAxis || labels.length === 0) return
        
        ctx.save()
        ctx.fillStyle = 'rgba(100, 100, 100, 0.15)' // Light gray with transparency
        
        // Find night hour ranges and draw rectangles
        let nightStart = null
        
        labels.forEach((label, index) => {
            // Extract hour and date from label (format: "DD/MM/YYYY HHh")
            const match = label.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})h$/)
            if (!match) return
            
            const [, day, month, year, hourStr] = match
            const hour = parseInt(hourStr)
            const dateStr = `${year}-${month}-${day}`
            
            const isNight = isNightTime(hour, dateStr)
            
            if (isNight && nightStart === null) {
                nightStart = index
            } else if (!isNight && nightStart !== null) {
                // Draw rectangle for the night period that just ended
                drawNightRect(ctx, xAxis, chartArea, nightStart, index - 1, labels.length)
                nightStart = null
            }
        })
        
        // Handle case where night period extends to the end
        if (nightStart !== null) {
            drawNightRect(ctx, xAxis, chartArea, nightStart, labels.length - 1, labels.length)
        }
        
        ctx.restore()
    }
}

function drawNightRect(ctx, xAxis, chartArea, startIdx, endIdx, totalLabels) {
    // Calculate pixel positions for the rectangle
    const xStart = xAxis.getPixelForValue(null, startIdx)
    const xEnd = xAxis.getPixelForValue(null, endIdx)
    
    // Calculate width per label to extend rectangle properly
    const labelWidth = (xAxis.right - xAxis.left) / (totalLabels - 1 || 1)
    
    const x = startIdx === 0 ? chartArea.left : xStart - labelWidth / 2
    const width = (endIdx - startIdx + 1) * labelWidth
    
    ctx.fillRect(x, chartArea.top, width, chartArea.bottom - chartArea.top)
}

// Register the plugin
Chart.pluginService.register(nightTimePlugin)

const formatDateTime = (str) => {
    const time = str.split(' ')
    const date = time[0].split('/')
    return {
        day: date[0],
        month: date[1],
        year: date[2],
        hour: time[1]
    }
  }
// Populate year selector with last 5 years
const initYearSelector = () => {
    const yearSelect = document.getElementById('year-select')
    const currentYear = new Date().getFullYear()
    
    // Clear existing options
    yearSelect.innerHTML = ''
    
    // Add last 5 years
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i
        const option = document.createElement('option')
        option.value = year
        option.textContent = year
        yearSelect.appendChild(option)
    }
    
    // Set stored value or current year
    const storedYear = localStorage.getItem('selectedYear')
    if (storedYear && parseInt(storedYear) >= currentYear - 4) {
        yearSelect.value = storedYear
    } else {
        yearSelect.value = currentYear
        localStorage.setItem('selectedYear', currentYear)
    }
}

// Show/hide year selector based on period
const updateYearSelectorVisibility = (depth) => {
    const yearContainer = document.getElementById('year-selector-container')
    if (parseInt(depth) >= 8760) {
        yearContainer.style.display = 'block'
    } else {
        yearContainer.style.display = 'none'
    }
}

const selectPeriod = (o) => {
    const depth = o.options[o.selectedIndex].value
    localStorage.setItem('depth', depth)
    const device = localStorage.getItem('device')
    const forecast = localStorage.getItem('forecast')
    
    // Show/hide year selector
    updateYearSelectorVisibility(depth)
    
    loadData(depth, forecast, device)
}

const selectforecast = (o) => {
    const forecast = o.options[o.selectedIndex].value
    localStorage.setItem('forecast', forecast)
    const device = localStorage.getItem('device')
    const depth = localStorage.getItem('depth')
    loadData(depth, forecast, device)
}

const selectdevices = (o) => {
    const device = o.options[o.selectedIndex].value
    localStorage.setItem('device', device)
    const depth = localStorage.getItem('depth')
    const forecast = localStorage.getItem('forecast')
    loadData(depth, forecast, device)
}

const selectYear = (o) => {
    const year = o.options[o.selectedIndex].value
    localStorage.setItem('selectedYear', year)
    const device = localStorage.getItem('device')
    const depth = localStorage.getItem('depth')
    
    // Reload data with new year
    if (parseInt(depth) >= 8760) {
        loadData(depth, 0, device)
    }
}

const refreshDevices = (id, callback) => {
    xhttp = new XMLHttpRequest()
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
            const options = JSON.parse(this.responseText)
            const allOptions = [{id: 'All', label: 'Tous'}, ...options]
            allOptions.forEach(el => {
                var option = document.createElement("option")
                option.setAttribute("value", el.id)
                option.textContent = el.label
                document.getElementById(id+'-select').append(option);
            })
            callback()
        }
    }
    xhttp.open("GET", "./"+id, true);
    xhttp.setRequestHeader("Cache-Control", "no-cache")
    xhttp.send();
    return;
}

Chart.controllers.LineAlt = Chart.controllers.line.extend({
    type: 'LineAlt',
    initialize: function(chart, datasetIndex){
        Chart.controllers.line.prototype.initialize.apply(this, arguments)
        this.originalUpdate = this.draw
        this.draw = function () {
            this.originalUpdate()
            // this.chart.ctx.fillStyle = 'rgba(100,100,100,0.1)'
            // chart.ctx.fillRect(0, 0, chart.width, chart.height)
        }
    }
})
  
const myChart = new Chart(ctx, {
    type: 'LineAlt',
    data: {},
    options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        elements: {
            point:{
                radius: 1
            }
        },
        tooltips: {
            mode: 'nearest',
            callbacks: {
                label: function(tooltipItem, data) {
                    const dataset = data.datasets[tooltipItem.datasetIndex]
                    const value = dataset.data[tooltipItem.index]
                    
                    // Handle floating bar (candlestick) data [min, max]
                    if (Array.isArray(value)) {
                        return dataset.label + ': ' + value[0].toFixed(1) + ' - ' + value[1].toFixed(1)
                    }
                    
                    // Normal single value
                    return dataset.label + ': ' + (value !== null ? value : '-')
                }
            }
        },
        scales: {
            yAxes: [{
                id: 'left-y-axis',
                type: 'linear',
                position: 'left',
                ticks: {
                    beginAtZero: true,
                }
            },{
                id: 'right-y-axis',
                type: 'linear',
                position: 'right',
                ticks: {
                    beginAtZero: true,
                }
            }],
            xAxes: [{
                gridLines: {
                    drawTicks: true,
                },
                ticks: {
                    maxTicksLimit: 24,
                    autoSkip: false,
                    callback: (value, index, values) => {
                        // For yearly view (labels are already in DD-MMM format)
                        if (currentDepth >= 8760) {
                            return index % 4 === 0 ? value : null
                        }
                        
                        const date = formatDateTime(value)
                        if (!date.hour) return value
                        
                        // Parse hour as number (handles "00h", "0h", "00", etc.)
                        const hour = parseInt(date.hour)
                        const currentDay = date.day + '/' + date.month
                        
                        // Check if this is the first occurrence of this day
                        let isFirstOfDay = (hour === 0) // Midnight is always first
                        if (!isFirstOfDay && index > 0) {
                            // Get previous label and check if day changed
                            const prevValue = values[index - 1].value !== undefined ? values[index - 1].value : values[index - 1]
                            const prevDate = formatDateTime(prevValue)
                            const prevDay = prevDate.day + '/' + prevDate.month
                            isFirstOfDay = (currentDay !== prevDay)
                        }
                        if (index === 0) {
                            isFirstOfDay = true // First label always shows date
                        }
                        
                        // Show date "DD MMM" at first hour of each day
                        if (isFirstOfDay) {
                            return date.day + ' ' + monthLabel[parseInt(date.month) - 1]
                        }
                        
                        // For shorter periods (24h), show hours
                        if (currentDepth <= 24) {
                            return date.hour
                        }
                        
                        // For longer periods, show fewer labels
                        if (currentDepth <= 72) {
                            return (hour % 6 === 0) ? date.hour : null
                        }
                        
                        // For week/month, only show dates at midnight
                        return null
                    }
                }            
            }]
        }
    }
})

const myTable = new Tabulator("#summary", {
    layout:"fitColumns",
    columns:[ 
        {title:"Name", field:"label", width:"40%", formatter:"html"},
        {title:"Min", field:"min", width:"20%"},
        {title:"Max", field:"max", width:"20%"},
        {title:"Cur", field:"curr", width:"20%"},
    ],
})

// Show/hide UI elements
const showMessage = (msg) => {
    document.getElementById('message').textContent = msg
    document.getElementById('message').style.display = 'block'
    document.getElementById('myChart').style.display = 'none'
    document.getElementById('summary').style.display = 'none'
}

const hideMessage = () => {
    document.getElementById('message').style.display = 'none'
    document.getElementById('myChart').style.display = 'block'
    document.getElementById('summary').style.display = 'block'
}

// Load yearly candlestick data
const loadYearData = (device) => {
    var xhr = new XMLHttpRequest()
    Spinner.show()
    
    const selectedYear = localStorage.getItem('selectedYear') || new Date().getFullYear()
    xhr.open("GET", `./yeardata?device=${device}&year=${selectedYear}`)
    xhr.onreadystatechange = () => {
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
            
            // Convert candlestick data to floating bar chart
            // Each bar goes from min to max value
            const tempBars = jsondata.tempData.map(d => d ? [d.min, d.max] : null)
            const humBars = jsondata.humData.map(d => d ? [d.min, d.max] : null)
            
            myChart.data = {
                labels: jsondata.labels,
                datasets: [{
                    label: 'Temp: ' + jsondata.deviceLabel + ' (min-max)',
                    data: tempBars,
                    backgroundColor: jsondata.tempColor || 'rgba(255, 99, 132, 0.7)',
                    borderColor: jsondata.tempColor || 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    yAxisID: 'right-y-axis'
                }, {
                    label: 'Hum: ' + jsondata.deviceLabel + ' (min-max)',
                    data: humBars,
                    backgroundColor: jsondata.humColor || 'rgba(54, 162, 235, 0.7)',
                    borderColor: jsondata.humColor || 'rgba(54, 162, 235, 1)',
                    borderWidth: 1,
                    yAxisID: 'left-y-axis'
                }]
            }
            
            // Update chart type to bar for candlestick view
            myChart.config.type = 'bar'
            myChart.update()
            
            // Update summary table with yearly stats
            const tempValid = jsondata.tempData.filter(d => d !== null)
            const humValid = jsondata.humData.filter(d => d !== null)
            
            const summaryData = []
            if (tempValid.length > 0) {
                summaryData.push({
                    label: '&#127777; Temp: ' + jsondata.deviceLabel,
                    min: Math.min(...tempValid.map(d => d.min)).toFixed(1),
                    max: Math.max(...tempValid.map(d => d.max)).toFixed(1),
                    curr: tempValid[tempValid.length - 1]?.avg || '-'
                })
            }
            if (humValid.length > 0) {
                summaryData.push({
                    label: '&#x1F4A7; Hum: ' + jsondata.deviceLabel,
                    min: Math.min(...humValid.map(d => d.min)).toFixed(1),
                    max: Math.max(...humValid.map(d => d.max)).toFixed(1),
                    curr: humValid[humValid.length - 1]?.avg || '-'
                })
            }
            
            myTable.setData(summaryData)
            const selectedYear = parseInt(localStorage.getItem('selectedYear')) || new Date().getFullYear()
            const currentYear = new Date().getFullYear()
            if (selectedYear === currentYear) {
                document.getElementById('timestamp').innerHTML = '12 derniers mois par semaine'
            } else {
                document.getElementById('timestamp').innerHTML = 'Année ' + selectedYear + ' par semaine'
            }
            Spinner.hide()
        }
    }
    xhr.send(null)
}

const loadData = (depth, forecast, device) => {
    // Update current depth for x-axis formatting
    currentDepth = parseInt(depth) + parseInt(forecast)
    
    // Handle "Année" view (8760 hours = 1 year)
    if (parseInt(depth) >= 8760) {
        if (device === 'All') {
            Spinner.hide()
            showMessage('Sélectionner un thermomètre')
            myTable.setData([])
            return
        }
        hideMessage()
        loadYearData(device)
        return
    }
    
    // Normal line chart view
    hideMessage()
    
    // Reset chart type to line if it was changed
    if (myChart.config.type !== 'LineAlt') {
        myChart.config.type = 'LineAlt'
    }
    
    var xhr = new XMLHttpRequest()
    Spinner.show()
    
    xhr.open("GET", `./data?depth=${depth}&forecast=${forecast}&device=${device}`)
    xhr.onreadystatechange = async () => { 
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
            
            // Prefetch sunrise/sunset data for chart labels (for night shading)
            if (jsondata.chartdata && jsondata.chartdata.labels) {
                await prefetchSunData(jsondata.chartdata.labels)
            }
            
            myChart.data = jsondata.chartdata
            myChart.update()
            myTable.setData(jsondata.summary)
            myTable.refresh
            document.getElementById('timestamp').innerHTML = 'Dernière mesure à '+jsondata.timestamp
            Spinner.hide()
        }
    }
    xhr.send(null)
}

const refresh = () => {
    if (screen.orientation && screen.orientation.type === 'landscape-primary') {
        document.getElementById('myChart').style.display='block'
        document.getElementById('summary').style.display='none'
    } else if (screen.orientation && screen.orientation.type === 'portrait-primary') {
        document.getElementById('myChart').style.display='none'
        document.getElementById('summary').style.display='block'
    } 
}

if (window.screen.orientation) {
    window.screen.orientation.addEventListener('change', function() {
        refresh()
    });
}
var depth = localStorage.getItem('depth')
var device = localStorage.getItem('device')
var forecast = localStorage.getItem('forecast')
if (depth == undefined) {
    depth = 24
    localStorage.setItem('depth', depth)
}
if (device == undefined) {
    device = 'All'
    localStorage.setItem('device', device)
}
if (forecast == undefined) {
    forecast = 24
    localStorage.setItem('forecast', forecast)
}
refreshDevices('devices', ()=> {
    document.getElementById('devices-select').value = device
})

// Initialize year selector
initYearSelector()

// Pre-fetch today's sunrise/sunset data
const today = new Date()
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
fetchSunData(todayStr)

document.getElementById('period-select').value = depth
document.getElementById('forecast-select').value = forecast

// Show/hide year selector based on initial depth
updateYearSelectorVisibility(depth)

Spinner();
loadData(depth, forecast, device)
refresh()