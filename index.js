const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');
const express = require("express");
const pTimeout = require('p-timeout');

// For uptime API to keep the bot alive
const app = express();
const PORT = process.env.PORT || 3000;
const startTime = Date.now();

app.get("/uptime", (req, res) => {
  const currentTime = Date.now();
  const uptimeMilliseconds = currentTime - startTime;
  const uptimeSeconds = Math.floor(uptimeMilliseconds / 1000);

  res.json({
    uptime: `${uptimeSeconds} seconds`,
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const botToken = process.env.BOT_TOKEN;
const bot = new Telegraf(botToken);

bot.start((ctx) => {
  ctx.reply('Welcome to the Image to PDF bot! Please send me the URL of the images you want to convert to PDF.');
});

bot.help((ctx) => {
  ctx.reply(
    'Welcome to AsuraScans – Downloader!\n\n' +
    '/dl {chapter_url} or just send the chapter_url: Download a specific chapter. \n\n/mdl {chapter_url} | {start_chapter} -> {end_chapter}: Download a range of chapters. \n\n/help: View available commands and instructions.'
  );
});

bot.on('text', async (ctx) => {

  const messageText = ctx.message.text;
  const match = messageText.match(/(https:\/\/www\.mangapill\.com\/manga\/\d+\/[\w-]+) \| (\d+) -> (\d+)/);

  if (!match) {
    ctx.reply('Invalid command format. Please use "URL | startCh -> endCh".');
    return;
  }

  const url = match[1];
  const startPoint = parseInt(match[2]);
  const endPoint = parseInt(match[3]);


  if (isNaN(startPoint) || isNaN(endPoint) || startPoint <= 0 || endPoint <= 0 || startPoint > endPoint) {
    ctx.reply('Invalid chapter range. Please provide valid starting and ending chapter numbers.');
    return;
  }


  try {
    const downloadingMessage = await ctx.reply('Downloading, please wait...', {
      reply_to_message_id: ctx.message.message_id,
    });

    const urlsJson = await scrapeChapterUrl(url);

    const chapterUrls = getChapterUrls(startPoint, endPoint, urlsJson);

    console.log(chapterUrls);

    await processAllChapters(chapterUrls, ctx);

    await ctx.telegram.editMessageText(
      downloadingMessage.chat.id,
      downloadingMessage.message_id,
      null,
      'All chapters Downloaded successfully.'
    );

  } catch (error) {
    console.error('Error:', error);
    ctx.reply('An error occurred while processing the URL.');
  }
});

bot.launch();

async function scrapeImagesAsura(url) {
  try {
    const folderName = "tmp/" + url.split('/').filter(Boolean).pop().replace(/^(\d+-)/, '');
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const readerArea = $('#readerarea');
    const imgElements = readerArea.find('img[decoding="async"][src]');

    if (!fs.existsSync(folderName)) {
      fs.mkdirSync(folderName);
    }

    const imgSrcArray = [];

    imgElements.each((index, element) => {
      const imgSrc = $(element).attr('src');
      imgSrcArray.push(imgSrc);
    });

    for (let i = 0; i < imgSrcArray.length; i++) {
      const imgSrc = imgSrcArray[i];
      if (imgSrc) {
        const imgName = path.basename(imgSrc);
        const imgPath = path.join(folderName, imgName);

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
    }

    return folderName;

  } catch (error) {
    console.error('Error:', error);
  }
}

async function createPdfFromImages(folderName) {
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
        console.error(`Error processing image: ${imagePath}`, imageError);
        continue;
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
    fs.rmSync(folderName, { recursive: true });
    fs.unlinkSync(pdfPath);
    console.log('Cleanup completed successfully.');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

async function scrapeChapterUrl(url) {
  try {
    const baseUrl = new URL(url).origin;
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const divWithFilterList = $('div[data-filter-list]');
    const aElements = divWithFilterList.find('a');
    const hrefArray = [];

    aElements.each((index, element) => {
      const href = $(element).attr('href');
      if (href) {
        const completeHref = href.startsWith('http') ? href : baseUrl + href;
        hrefArray.push(completeHref);
      }
    });

    const reversedArray = hrefArray.reverse();
    const jsonContent = {
      mangaName: path.basename(url),
      baseUrl: url,
      reversedHrefValues: reversedArray,
    };

    const jsonString = JSON.stringify(jsonContent, null, 2);
    const fileName = path.basename(url) + '.json';
    fs.writeFileSync(fileName, jsonString);
    return fileName;

  } catch (error) {
    console.error('Error:', error);
  }
}

function getChapterUrls(startPoint, endPoint, urlsJson) {
  try {
    // Read the JSON file containing the URLs
    const jsonData = fs.readFileSync('omniscient-reader.json', 'utf-8');
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


async function scrapeImagesMangapill(url) {
  try {
    const folderName = "tmp/" + url.split('/').filter(Boolean).pop().replace(/^(\d+-)/, '');
    // Make a GET request to the URL
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const readerArea = $('.relative.bg-card.flex.justify-center.items-center');
    const imgElements = readerArea.find('img[data-src]');

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


async function processAllChapters(chapterUrls, ctx) {
  try {
    for (const url of chapterUrls) {
      try {
        // const folderName = await scrapeImagesMangapill(url);
        const folderName = await pTimeout(scrapeImagesMangapill(url), 90000);
        const pdfPath = await createPdfFromImages(folderName);
        const pdfFileName = path.basename(pdfPath);

        await ctx.replyWithDocument({ source: pdfPath }, { filename: pdfFileName });
        cleanup(folderName, pdfPath);
        console.log(`Chapter processed successfully: ${url}`);
      } catch (error) {
        if (error instanceof pTimeout.TimeoutError) {
          console.error('Operation timed out:', error);
        } else {
          console.error('Error processing chapter:', error);
        }
      }

    }
    console.log('All chapters Downloaded successfully');
  } catch (error) {
    console.error('Error processing chapters:', error);
  }
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // You can add additional error handling logic here if needed
});