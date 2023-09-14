const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');
const express = require("express");

// for uptime api that can keep the bot alive
const app = express();
const PORT = 3000;
// To track bot's uptime
const startTime = Date.now();

app.get("/uptime", (req, res) => {
  const currentTime = Date.now();
  const uptimeMilliseconds = currentTime - startTime;
  const uptimeSeconds = Math.floor(uptimeMilliseconds / 1000);

  // Returning JSON data
  res.json({
    uptime: `${uptimeSeconds} seconds`,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

//_______________________________________________________________

// Get the bot token from the environment variable
const botToken = process.env.BOT_TOKEN;

// Check if the bot token is defined
if (!botToken) {
  console.error('Bot token not found in environment variables. Make sure to set the BOT_TOKEN secret.');
  process.exit(1); // Exit the program with an error code
}

const bot = new Telegraf(botToken);

// if u dont wanna use environment variable u can use token in below line.
// const bot = new Telegraf('<BOT_TOKEN>');


bot.start((ctx) => {
  ctx.reply('Welcome to the Image to PDF bot! Please send me the URL of the images you want to convert to PDF.');
});

bot.help((ctx) => {
  ctx.reply(
    'Welcome to AsuraScans – Downloader!\n\n' +
    '/dl {chapter_url} or juat send the chapter_url: Download a specific chapter. \n\n/mdl {chapter_url} | {start_chapter} -> {end_chapter}: Download a range of chapters. \n\n/help: View available commands and instructions.'
  );
});

const timeoutDuration = 50000;

bot.command('mdl', async (ctx) => {
  const messageText = ctx.message.text;
  const match = messageText.match(/\/mdl (https:\/\/asuracomics\.com\/.+?) \| (\d+) -> (\d+)/);

  if (!match) {
    ctx.reply('Invalid command format. Please use "/mdl URL | startCh -> endCh".');
    return;
  }

  const baseUrl = match[1];
  const startChapter = parseInt(match[2]);
  const endChapter = parseInt(match[3]);

  if (isNaN(startChapter) || isNaN(endChapter) || startChapter <= 0 || endChapter <= 0 || startChapter > endChapter) {
    ctx.reply('Invalid chapter range. Please provide valid starting and ending chapter numbers.');
    return;
  }

  try {
    // Loop through chapters
    for (let chapterNumber = startChapter; chapterNumber <= endChapter; chapterNumber++) {
      const url = `${baseUrl}-chapter-${chapterNumber}/`;

      // Show a "downloading, please wait" message for each chapter
      const downloadingMessage = await ctx.reply(`Downloading Chapter ${chapterNumber}, please wait...`);

      // Use Promise.race to set a timeout for the current chapter's download
      const chapterPromise = new Promise(async (resolve, reject) => {
        try {
          // Scrape images and create PDF for the current chapter
          const folderName = await scrapeImages(url);
          const pdfPath = await createPdfFromImages(folderName);

          // Send the generated PDF to the user for the current chapter
          const pdfFileName = path.basename(pdfPath);
          await ctx.replyWithDocument({ source: pdfPath }, { filename: pdfFileName });

          // Clean up the temporary folder and PDF file for the current chapter
          cleanup(folderName, pdfPath);

          // Resolve the Promise when download is complete
          resolve();
        } catch (error) {
          // Reject the Promise if there's an error
          reject(error);
        }
      });

      // Use Promise.race to set a timeout for the current chapter's download
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Chapter ${chapterNumber} download timed out`));
        }, timeoutDuration);
      });

      // Wait for either the chapterPromise or timeoutPromise to resolve
      await Promise.race([chapterPromise, timeoutPromise]);

      // Delete the "Downloading Chapter X" message after 5 seconds
      setTimeout(async (message) => {
        await ctx.telegram.deleteMessage(message.chat.id, message.message_id);
      }, 5000, downloadingMessage);
    }

    ctx.reply('All chapters download complete.');

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('An error occurred while processing the URL.');
  }
});


bot.command('dl', async (ctx) => {
  const text = ctx.message.text;

  // Check if the message contains a valid URL
  // Define a regular expression pattern for the expected URL format
  const validURLPattern = /^\/dl (https:\/\/asuracomics\.com\/.+?)\/$/;

  // Check if the URL matches the pattern
  const match = text.match(validURLPattern);

  if (!match) {
    ctx.reply('Invalid URL. Please provide a valid asuracomics URL.');
    return;
  }

  const url = match[1];
  console.log(url);

  try {
    // Show a "downloading, please wait" message
    const downloadingMessage = await ctx.reply('Downloading, please wait...', {
      reply_to_message_id: ctx.message.message_id,
    });

    // Scrape images and create PDF
    console.log(url);

    const folderName = await scrapeImages(url);

    // Update the message to indicate that image downloading is complete
    await ctx.telegram.editMessageText(
      downloadingMessage.chat.id,
      downloadingMessage.message_id,
      null,
      'Image downloading complete. Generating PDF...'
    );

    const pdfPath = await createPdfFromImages(folderName);

    // Update the message to indicate that PDF generation is complete
    await ctx.telegram.editMessageText(
      downloadingMessage.chat.id,
      downloadingMessage.message_id,
      null,
      'PDF generation complete. Sending document...'
    );


    console.log(pdfPath);

    // Send the generated PDF to the user
    const pdfFileName = path.basename(pdfPath);
    ctx.replyWithDocument({ source: pdfPath }, { filename: pdfFileName })
      .then(async () => {

        // Update the message to indicate that the document is ready for download
        const readyMessage = await ctx.telegram.editMessageText(
          downloadingMessage.chat.id,
          downloadingMessage.message_id,
          null,
          'Document file ready for download. Cleaning up...'
        );

        // Delete the "Document file ready for download" message after 5 seconds
        setTimeout(async (message) => {
          await ctx.telegram.deleteMessage(message.chat.id, message.message_id);
        }, 3000, readyMessage);

        // File sent successfully, now clean up
        cleanup(folderName, pdfPath);
      })
      .catch((error) => {
        console.error('Error sending file:', error);
        // Handle the error here, such as retrying or reporting the issue
      });


  } catch (error) {
    console.error('Error:', error);
    ctx.reply('An error occurred while processing the URL.');
  }
});



bot.on('text', async (ctx) => {
  const url = ctx.message.text;

  // Check if the message contains a valid URL
  // Define a regular expression pattern for the expected URL format
  const validURLPattern = /^https:\/\/asuracomics\.com\/(\d+-.+?)\/$/;

  // Check if the URL matches the pattern
  const match = url.match(validURLPattern);

  if (!match) {
    ctx.reply('Invalid URL. Please provide a valid asuracomics URL.');
    return;
  }

  try {
    // Show a "downloading, please wait" message
    const downloadingMessage = await ctx.reply('Downloading, please wait...', {
      reply_to_message_id: ctx.message.message_id,
    });

    // Scrape images and create PDF
    const folderName = await scrapeImages(url);

    // Update the message to indicate that image downloading is complete
    await ctx.telegram.editMessageText(
      downloadingMessage.chat.id,
      downloadingMessage.message_id,
      null,
      'Image downloading complete. Generating PDF...'
    );

    const pdfPath = await createPdfFromImages(folderName);

    // Update the message to indicate that PDF generation is complete
    await ctx.telegram.editMessageText(
      downloadingMessage.chat.id,
      downloadingMessage.message_id,
      null,
      'PDF generation complete. Sending document...'
    );


    console.log(pdfPath);

    // Send the generated PDF to the user
    const pdfFileName = path.basename(pdfPath);
    ctx.replyWithDocument({ source: pdfPath }, { filename: pdfFileName })
      .then(async () => {

        // Update the message to indicate that the document is ready for download
        const readyMessage = await ctx.telegram.editMessageText(
          downloadingMessage.chat.id,
          downloadingMessage.message_id,
          null,
          'Document file ready for download. Cleaning up...'
        );

        // Delete the "Document file ready for download" message after 5 seconds
        setTimeout(async (message) => {
          await ctx.telegram.deleteMessage(message.chat.id, message.message_id);
        }, 3000, readyMessage);

        // File sent successfully, now clean up
        cleanup(folderName, pdfPath);
      })
      .catch((error) => {
        console.error('Error sending file:', error);
        // Handle the error here, such as retrying or reporting the issue
      });


  } catch (error) {
    console.error('Error:', error);
    ctx.reply('An error occurred while processing the URL.');
  }
});


bot.launch();


async function scrapeImages(url) {
  try {
    const folderName = "tmp/" + url.split('/').filter(Boolean).pop().replace(/^(\d+-)/, '');
    // Make a GET request to the URL
    const response = await axios.get(url);

    // Load the HTML content into Cheerio
    const $ = cheerio.load(response.data);

    // Find the <div id="readerarea"> element
    const readerArea = $('#readerarea');

    // Find all <img> elements within the <div id="readerarea">
    const imgElements = readerArea.find('img[decoding="async"][src]');

    // Create a directory for the images
    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName);
    }

    // Create an array to store the image source URLs
    const imgSrcArray = [];

    // Loop through the img elements and collect the image source URLs
    imgElements.each((index, element) => {
      const imgSrc = $(element).attr('src');
      imgSrcArray.push(imgSrc);
    });

    console.log(imgSrcArray);

    // Loop through the array of image source URLs and download the images
    for (let i = 0; i < imgSrcArray.length; i++) {
      const imgSrc = imgSrcArray[i];
      const imgName = path.basename(imgSrc);
      const imgPath = path.join(folderName, imgName);

      // Download the image
      await axios({
        method: 'get',
        url: imgSrc,
        responseType: 'stream',
      }).then((response) => {
        response.data.pipe(fs.createWriteStream(imgPath));
        console.log(`Downloaded: ${imgPath}`);
      }).catch((error) => {
        console.error(`Error downloading image: ${imgSrc}`);
      });
    }

    return folderName;

  } catch (error) {
    console.error('Error:', error);
  }
}

async function createPdfFromImages(folderName) {

  const pdfPath = folderName + '.pdf';
  const imageFiles = fs.readdirSync(folderName);
  const pdfDoc = await PDFDocument.create();
  const pdfPages = [];

  for (const imageFile of imageFiles) {
    const imagePath = path.join(folderName, imageFile);

    // Get the image dimensions dynamically
    const { width: imageWidth, height: imageHeight } = await sharp(imagePath).metadata();

    const pdfPage = pdfDoc.addPage([imageWidth, imageHeight]);
    const image = await sharp(imagePath).toBuffer();
    const imageXObject = await pdfDoc.embedJpg(image);

    pdfPage.drawImage(imageXObject, {
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
    });

    pdfPages.push(pdfPage);
  }

  for (const pdfPage of pdfPages) {
    pdfPage.setFontSize(12);
    pdfPage.drawText('tg@misfitsdev', {
      x: 30,
      y: 30,
      color: rgb(0, 0, 0),
    });
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, pdfBytes);

  return pdfPath;
}

async function cleanup(folderName, pdfPath) {
  try {
    // Remove the temporary folder and its contents
    fs.rmSync(folderName, { recursive: true });

    // Remove the generated PDF file
    fs.unlinkSync(pdfPath);

    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}