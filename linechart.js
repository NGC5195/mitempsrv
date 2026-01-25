const ctx = document.getElementById('myChart').getContext('2d')
const monthLabel = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jui', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc']

// Track current depth for x-axis formatting
let currentDepth = 24

// Plugin to draw gray background for nighttime hours (21h-06h)
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
            // Extract hour from label (format: "DD/MM/YYYY HHh")
            const hourMatch = label.match(/(\d{2})h$/)
            if (!hourMatch) return
            
            const hour = parseInt(hourMatch[1])
            const isNight = hour >= 21 || hour < 6 // 21h to 06h
            
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
const selectPeriod = (o) => {
    const depth = o.options[o.selectedIndex].value
    localStorage.setItem('depth', depth)
    const device = localStorage.getItem('device')
    const forecast = localStorage.getItem('forecast')
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
                    maxTicksLimit: 12,
                    callback: (value, index, values) => {
                        // For yearly view (labels are already in DD-MMM format)
                        if (currentDepth >= 8760) {
                            // Show every 4th label for readability
                            return index % 4 === 0 ? value : null
                        }
                        
                        const date = formatDateTime(value)
                        if (!date.hour) return value // Fallback if format doesn't match
                        
                        // For longer periods (48h+), show date format "DD-MMM"
                        if (currentDepth >= 48) {
                            // Show date at midnight or at regular intervals
                            if (date.hour == '00h' || index === 0) {
                                return date.day + '-' + monthLabel[parseInt(date.month) - 1]
                            } else if (currentDepth >= 168) {
                                // For week/month, only show dates (skip hours entirely)
                                return null
                            } else {
                                // For 48h-72h, show some hours at noon
                                return date.hour == '12h' ? '12h' : null
                            }
                        } else {
                            // For 24h, show hours with date at midnight
                            if (date.hour == '00h') {
                                return date.day + ' ' + monthLabel[parseInt(date.month) - 1]
                            } else {
                                return date.hour
                            }
                        }
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
    
    xhr.open("GET", `./yeardata?device=${device}`)
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
            document.getElementById('timestamp').innerHTML = 'Vue annuelle par semaine'
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
    xhr.onreadystatechange = () => { 
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
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


document.getElementById('period-select').value = depth
document.getElementById('forecast-select').value = forecast
Spinner();
loadData(depth, forecast, device)
refresh()