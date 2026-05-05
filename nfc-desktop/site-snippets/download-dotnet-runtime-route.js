// Zet deze route in je Express app.
// Update de URL als Microsoft een nieuwere .NET 8 Desktop Runtime uitbrengt.
app.get('/api/download-dotnet-runtime', (req, res) => {
  res.redirect('https://download.visualstudio.microsoft.com/download/pr/placeholder/windowsdesktop-runtime-8.0-win-x64.exe')
})
