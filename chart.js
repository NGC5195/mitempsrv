const ctx = document.getElementById('myChart').getContext('2d')
const monthLabel = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jui', 'Jui', 'Aoû', 'Sep', 'Oct', 'Noc', 'Déc']

const formatDateTime = (str) => {
    const time = str.split(' ');
    const date = time[0].split('/');
    return {
        day: date[0],
        month: date[1],
        year: date[2],
        hour: time[1]
    }
  }
const selectPeriod = (o) => {
    const value = o.options[o.selectedIndex].value;
    localStorage.setItem('depth', value)
    loadData(value) 
}
  
const myChart = new Chart(ctx, {
    type: 'line',
    data: {},
    options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
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

const loadData = (depth) => {
    var xhr = new XMLHttpRequest()
    xhr.open("GET", `./data?depth=${depth}`)
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
if (depth == "undefined") {
    depth = 24
}
loadData(depth)

