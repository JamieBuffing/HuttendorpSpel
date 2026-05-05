// Zet deze route in je Express app als je via je eigen endpoint wilt redirecten.
// De installer kan ook direct de Microsoft aka.ms URL gebruiken.
app.get('/api/download-dotnet-runtime', (req, res) => {
  res.redirect('https://aka.ms/dotnet/8.0/windowsdesktop-runtime-win-x64.exe')
})
