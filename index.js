const { Telegraf } = require('telegraf');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');
const path = require('path');

const bot = new Telegraf('<BOT_TOKEN>');
const currentTime = new Date().toLocaleTimeString();
console.log(`Bot started at ${currentTime}`);

bot.start((ctx) => {
  ctx.reply('Welcome to the Image to PDF bot! Please send me the URL of the images you want to convert to PDF.');
});

bot.help((ctx) => {
  ctx.reply(
    'Welcome to the Image to PDF bot!\n\n' +
    'To use this bot, simply send a valid URL that contains images you want to convert to PDF. ' +
    'The bot will scrape the images and send you a PDF document.\n\n' +
    'Commands:\n' +
    '/help - Show this help message\n'
  );
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
      .then(() => {
        // Update the message to indicate that the document is ready for download
        ctx.telegram.editMessageText(
          downloadingMessage.chat.id,
          downloadingMessage.message_id,
          null,
          'Document file ready for download. Cleaning up...'
        );
        // Delete the "Document file ready for download" message after 5 seconds
        setTimeout(async () => {
          await ctx.telegram.deleteMessage(readyMessage.chat.id, readyMessage.message_id);
        }, 5000);
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
