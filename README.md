<p align="center">
  <a href="https://github.com/tas33n/AsuraScans-DL-Bot">
    <img src="https://asuracomics.com/wp-content/uploads/2023/07/cropped-cropped-Group_1-1-270x270.png" alt="Logo" width="85" height="85">
  </a>

  <h3 align="center">AsuraScans (Asuracomics) Manhwa– Downloader</h3>

  <p align="center">
    <samp>A simple bot to download Manhwa Chapters as PDF from <a href="https://https://asuracomics.com/">AsuraScans/Asuracomics</a></samp>
    <br />
    <br />
    <a href="https://github.com/tas33n/AsuraScans-DL-Bot/issues/new?assignees=tas33n&labels=bug&template=bug-report.yml">Bug report</a>
    ·
    <a href="https://github.com/tas33n/AsuraScans-DL-Bot/issues/new?assignees=tas33n&labels=enhancement&template=feature-request.md">Feature request</a>
  </p>
  <p align="center">
        <a href="https://github.com/tas33n/AsuraScans-DL-Bot">
      <img src="https://img.shields.io/github/stars/tas33n/AsuraScans-DL-Bot" alt="stars">
    </a>
        <a href="https://github.com/consumet/extensions/blob/master/LICENSE">
      <img src="https://img.shields.io/github/license/consumet/extensions" alt="GitHub">
    </a>
  </p>
</p>

## Features

1. **Download Individual Manga/Manhwa Chapters**
   - Use the `/dl` command followed by the chapter's URL or just send the chapter's URL to download specific chapters.

2. **View and Download PDF Documents**
   - Receive chapters in PDF format for easy reading on any device.

3. **Supports Multiple Manga/Manhwa Series**
   - Download chapters from a variety of manga and manhwa series available on AsuraScans.

4. **Clean and Organized Downloads**
   - Each series is saved in a separate folder for better organization.

5. **Error Handling**
   - Comprehensive error handling and user-friendly responses for better user experience.

6. **Help Command**
   - Use the `/help` command to view available commands and usage instructions.

7. **Server Uptime Information**
   - Access server uptime information via an Express API endpoint.

8. **Parallel Downloading**
   - Download multiple chapters in parallel to save time.

9. **Manual Chapter Download**
   - Use the `/mdl` command to manually specify the start and end chapters for download.

10. **Dynamic URL Validation**
    - Verify URLs for chapters to ensure they match the expected AsuraScans format.

11. **Graceful Cleanup**
    - Automatically clean up temporary files and folders after successful downloads.

12. **Responsive User Experience**
    - Get real-time feedback on download progress, errors, and completed tasks.

## Usage

1. Start a chat with the bot by mentioning `@AsuraScans_bot` on Telegram.

2. Use the available commands to interact with the bot:
   - `/dl {chapter_url}` or juat send the chapter_url: Download a specific chapter.
   - `/mdl {chapter_url} | {start_chapter} -> {end_chapter}`: Download a range of chapters.
   - `/help`: View available commands and instructions.

3. Wait for the bot to process your request, and it will provide you with the requested manga/manhwa chapters in PDF format.

 <img src="https://raw.githubusercontent.com/tas33n/AsuraScans-DL-Bot/cec5255eafddab10aec12be5f6bf44c7bad7531f/preview.jpg" alt="AsuraScans Preview">
 
## Installation

### Local
Run the following command to clone the repository, and install the dependencies:

```sh
git clone https://github.com/tas33n/AsuraScans-DL-Bot.git
cd AsuraScans-DL-Bot
npm install #or yarn install
```

start the server with the following command:

```sh
npm start #or yarn start
```
Now the server is running on http://localhost:3000

### Repl.it
Host your own bot in Repl.it using the button below.

[![Run on Repl.it](https://repl.it/badge/github/tas33n/AsuraScans-DL-Bot)](https://repl.it/github/tas33n/AsuraScans-DL-Bot)

## Contributing
1. [Fork the repository](https://github.com/tas33n/AsuraScans-DL-Bot)
2. Clone your fork to your local machine using the following command **(make sure to change `<your_username>` to your GitHub username)**:
```sh
git clone https://github.com/<your-username>/AsuraScans-DL-Bot.git
```
3. Create a new branch: `git checkout -b <new-branch-name>` (e.g. `git checkout -b my-new-branch`)
4. Make your changes.
5. Stage the changes: `git add .`
6. Commit the changes: `git commit -m "My commit message"`
7. Push the changes to GitHub: `git push origin <new-branch-name>` (e.g. `git push origin my-new-branch`)
8. Open a pull request.

### Currently supported sites
<details>
<summary>Manga/Manhwa</summary>

- [Asuracomics](https://asuracomics.com/)
</details>

> ### Note:
> **Your feedback and suggestions are very welcome. Please [open an issue](https://github.com/tas33n/AsuraScans-DL-Bot/issues/new/choose).**
> This project will still be maintained.

## Author

- [Tas33n](https://github.com/tas33n)

## License

This project is licensed under the [MIT License](LICENSE).
