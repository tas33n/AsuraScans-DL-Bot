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
const PORT = process.env.PORT || 3000;
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
const botToken = "5855171019:AAGuJ_7hN_plpfZoHH9kkNJZSP2amCOQ-f0"; //process.env.BOT_TOKEN;

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

bot.on('text', async (ctx) => {
  const url = ctx.message.text;

  try {
    // Show a "downloading, please wait" message
    const downloadingMessage = await ctx.reply('Downloading, please wait...', {
      reply_to_message_id: ctx.message.message_id,
    });

    // Scrape the URLs of chapters
    const urlsJson = await scrapeChapterUrl(url);

    // Specify the start and end points for the range (e.g., 1 to 10)
    const startPoint = 8;
    const endPoint = 10;

    // Get the chapter URLs within the specified range
    const chapterUrls = getChapterUrls(startPoint, endPoint, urlsJson);

    // Process all chapters
    await processAllChapters(chapterUrls, ctx);

    // Send a success message
    await ctx.reply('All chapters processed successfully.');

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('An error occurred while processing the URL.');
  }
});


bot.launch();


async function scrapeImagesAsura(url) {
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

async function createPdfFromImages(folderName, url, chapterUrls) {
  try {
    const pdfPath = folderName + '.pdf';
    const imageFiles = fs.readdirSync(folderName);
    const pdfDoc = await PDFDocument.create();
    const pdfPages = [];

    for (const imageFile of imageFiles) {
      const imagePath = path.join(folderName, imageFile);

      try {
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
      } catch (imageError) {
        // Handle the case where the image is not a valid JPEG
        console.error(`Error processing image: ${imagePath}`, imageError);
        continue; // Skip this image and proceed with the next one
      }
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
  } catch (error) {
    console.error('Error creating PDF from images:', error);
    throw error;
  }
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


async function scrapeChapterUrl(url) {
  try {
    const baseUrl = new URL(url).origin; // Extract the base URL from the full URL

    // Make a GET request to the URL
    const response = await axios.get(url);

    // Load the HTML content into Cheerio
    const $ = cheerio.load(response.data);

    // Find the specific <div> with attribute data-filter-list
    const divWithFilterList = $('div[data-filter-list]');

    // Find all <a> elements within the div
    const aElements = divWithFilterList.find('a');

    // Create an array to store the href values with the host
    const hrefArray = [];

    // Iterate through the <a> elements and extract the href attributes
    aElements.each((index, element) => {
      const href = $(element).attr('href');
      if (href) {
        // Add the host (base URL) to the href values if they are relative
        const completeHref = href.startsWith('http') ? href : baseUrl + href;
        hrefArray.push(completeHref);
      }
    });

    // Reverse the hrefArray
    const reversedArray = hrefArray.reverse();

    // Create a JSON object with the manga name, base URL, and the reversed href values
    const jsonContent = {
      mangaName: path.basename(url),
      baseUrl: url,
      reversedHrefValues: reversedArray,
    };

    // Convert the JSON object to a string
    const jsonString = JSON.stringify(jsonContent, null, 2);

    // Save the JSON to a file with the manga name as the filename
    const fileName = path.basename(url) + '.json';
    fs.writeFileSync(fileName, jsonString);

    return fileName

    console.log(`Reversed JSON data saved to ${fileName}`);
  } catch (error) {
    console.error('Error:', error);
  }
}


async function scrapeImagesMangapill(url) {
  try {
    const folderName = "tmp/" + url.split('/').filter(Boolean).pop().replace(/^(\d+-)/, '');
    // Make a GET request to the URL
    const response = await axios.get(url);

    // Load the HTML content into Cheerio
    const $ = cheerio.load(response.data);

    // Find the <div id="readerarea"> element
    const readerArea = $('.relative.bg-card.flex.justify-center.items-center');

    const imgElements = readerArea.find('img[data-src]');


    // console.log(imgElements);


    // Create a directory for the images
    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName);
    }

    // Create an array to store the image source URLs
    const imgSrcArray = [];

    // Loop through the img elements and collect the image source URLs
    imgElements.each((index, element) => {
      const imgSrc = $(element).attr('data-src');
      imgSrcArray.push(imgSrc);
    });

    console.log(imgSrcArray);

    for (let i = 0; i < imgSrcArray.length; i++) {
      const imgSrc = imgSrcArray[i];

      // Check if imgSrc is defined
      if (imgSrc) {
        const imgName = path.basename(imgSrc);
        const imgPath = path.join(folderName, imgName);

        // Define custom headers
        const headers = {
          'sec-ch-ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
          'Referer': 'https://www.mangapill.com/',
          'DNT': '1',
          'sec-ch-ua-mobile': '?0',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36',
          'sec-ch-ua-platform': '"Windows"',
        };

        // Download the image with custom headers
        await axios({
          method: 'get',
          url: imgSrc,
          responseType: 'stream',
          headers: headers,
        }).then((response) => {
          response.data.pipe(fs.createWriteStream(imgPath));
          console.log(`Downloaded: ${imgPath}`);
        }).catch((error) => {
          console.error(`Error downloading image: ${imgSrc}`);
        });
      }
    }

    return folderName;

  } catch (error) {
    console.error('Error:', error);
  }
}

function getChapterUrls(startPoint, endPoint, urlsJson) {
  try {
    // Read the JSON file containing the URLs
    console.log(urlsJson);

    const jsonData = fs.readFileSync(urlsJson, 'utf-8');
    const mangaUrls = JSON.parse(jsonData);

    // Filter the URLs based on the specified range
    const matchingUrls = mangaUrls.reversedHrefValues.filter((url) => {
      const match = url.match(/-([0-9]+)$/);
      if (match) {
        const chapterNumber = parseInt(match[1]);
        return chapterNumber >= startPoint && chapterNumber <= endPoint;
      }
      return false;
    });

    return matchingUrls; // Return the array of matching URLs
  } catch (error) {
    console.error('Error:', error);
    return []; // Return an empty array in case of an error
  }
}




async function processAllChapters(chapterUrls, ctx) {
  try {
    // Loop through the chapter URLs and process each one
    for (const url of chapterUrls) {
      try {
        // Scrape images and create PDF for the current chapter
        const folderName = await scrapeImagesMangapill(url);
        const pdfPath = await createPdfFromImages(folderName);

        // Send the generated PDF to the user for the current chapter
        const pdfFileName = path.basename(pdfPath);
        await ctx.replyWithDocument({ source: pdfPath }, { filename: pdfFileName });

        // Clean up the temporary folder and PDF file for the current chapter
        cleanup(folderName, pdfPath);

        console.log(`Chapter processed successfully: ${url}`);
      } catch (error) {
        // Handle errors for the current chapter
        console.error(`Error processing chapter ${url}:`, error);
      }
    }

    console.log('All chapters processed successfully');
  } catch (error) {
    // Handle errors if needed
    console.error('Error processing chapters:', error);
  }
}


