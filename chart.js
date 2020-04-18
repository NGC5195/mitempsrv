const ctx = document.getElementById('myChart').getContext('2d')
const myChart = new Chart(ctx, {
    type: 'line',
    data: {},
    options: {
        animation: false,
        responsive: true,
        scales: {
            yAxes: [{
                ticks: {
                    beginAtZero: true
                }
            }]
        }
    }
})

const loadData = () => {
    var xhr = new XMLHttpRequest()
    xhr.open("GET", "./data")
    xhr.onreadystatechange = () => { 
        if (xhr.readyState === 4 && xhr.status === 200) {
            const jsondata = JSON.parse(xhr.responseText)
            myChart.data = jsondata
            myChart.update()
        }
    }
    xhr.send(null)
}

loadData()
