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
    loadData(depth, device)
}

const selectforecats = (o) => {

}

const selectdevices = (o) => {
    const device = o.options[o.selectedIndex].value
    localStorage.setItem('device', device)
    const depth = localStorage.getItem('depth')
    loadData(depth, device)
}

const includeDevices = () => {
    var z, i, elmnt, file, xhttp;

    z = document.getElementsByTagName("*");  
    for (i = 0; i < z.length; i++) {
      elmnt = z[i];
      file = elmnt.getAttribute("w3-include-devices");
      if (file) {
        xhttp = new XMLHttpRequest();
        xhttp.onreadystatechange = function() {
          if (this.readyState == 4) {
            if (this.status == 200) {
                elmnt.innerHTML = this.responseText;
            }
            if (this.status == 404) {elmnt.innerHTML = "Page not found.";}
            elmnt.removeAttribute("w3-include-menu");
          }
        } 
        xhttp.open("GET", file, true);
        xhttp.send();
        return;
      }
    }
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

const loadData = (depth, device) => {
    var xhr = new XMLHttpRequest()
    xhr.open("GET", `./data?depth=${depth}&device=${device}`)
    xhr.onreadystatechange = () => { 
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
            myChart.data = jsondata
            myChart.update()
        }
    }
    xhr.send(null)
}

var depth = localStorage.getItem('depth')
var device = localStorage.getItem('device')
if (depth == undefined) {
    depth = 24
}
if (device == undefined) {
    device = 'All'
}
includeDevices()
document.getElementById('period-select').value = depth
loadData(depth, device)

