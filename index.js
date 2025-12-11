const express =require("express")
const app =express()
const cors=require("cors")
require('dotenv').config()
const port =process.env.PORT||3000
app.use(cors())
app.use(express.json())


app.get('/', (req, res) => {
  res.send('germents factory')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
