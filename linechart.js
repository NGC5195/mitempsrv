import {Spinner} from 'spin.js';

const ctx = document.getElementById('myChart').getContext('2d')
const monthLabel = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jui', 'Aoû', 'Sep', 'Oct', 'Noc', 'Déc']

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
            mode: 'nearest'
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
                        const date = formatDateTime(value)
                        if (date.hour == '00h') {
                            return date.day+' '+monthLabel[parseInt(date.month)]
                        } else {
                            return date.hour
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

const loadData = (depth, forecast, device) => {
    var xhr = new XMLHttpRequest()
    xhr.open("GET", `./data?depth=${depth}&forecast=${forecast}&device=${device}`)
    xhr.onreadystatechange = () => { 
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
            myChart.data = jsondata.chartdata
            myChart.update()
            myTable.setData(jsondata.summary)
            myTable.refresh
            document.getElementById('timestamp').innerHTML = 'Dernière mesure à '+jsondata.timestamp            
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

var opts = {
    lines: 13, // The number of lines to draw
    length: 38, // The length of each line
    width: 17, // The line thickness
    radius: 45, // The radius of the inner circle
    scale: 1, // Scales overall size of the spinner
    corners: 1, // Corner roundness (0..1)
    speed: 1, // Rounds per second
    rotate: 0, // The rotation offset
    animation: 'spinner-line-fade-quick', // The CSS animation name for the lines
    direction: 1, // 1: clockwise, -1: counterclockwise
    color: '#ffffff', // CSS color or array of colors
    fadeColor: 'transparent', // CSS color or array of colors
    top: '50%', // Top position relative to parent
    left: '50%', // Left position relative to parent
    shadow: '0 0 1px transparent', // Box-shadow for the lines
    zIndex: 2000000000, // The z-index (defaults to 2e9)
    className: 'spinner', // The CSS class to assign to the spinner
    position: 'absolute', // Element positioning
  };
  
var spinner = new Spinner(opts).spin(document.getElementById('spinner'));
document.getElementById('period-select').value = depth
document.getElementById('forecast-select').value = forecast
document.getElementById('spinner').appendChild(spinner.el);
loadData(depth, forecast, device)
refresh()
