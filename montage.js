const path = require("path");
var fs = require("fs");
const spawnAsync = require("@expo/spawn-async");

const backgroundColor = "#fafafa";
const fontPath = "/System/Library/Fonts/Avenir Next.ttc";
const fontWeight = "300"; // ignored for some fonts
const fontSize = 64;
const fontColor = "rgba(0, 0, 0, 0.75)";

const { DEBUG } = process.env;

const findResult = result => {
  return result.output[0]
    .split("\n")
    .filter(entry => entry)
    .map(entry => entry.trim())
    .sort();
};

const rmkDir = path => {
  if (fs.existsSync(path)) {
    fs.rmdirSync(path, { recursive: true });
  }

  fs.mkdirSync(path);
};

const convert = args => {
  if (DEBUG) {
    console.debug(`magick convert ${args.join(" ")}`);
  }

  return spawnAsync("magick", ["convert", ...args]);
};

const composite = args => {
  const allArgs = ["composite", "-colorspace", "RGB", ...args];

  if (DEBUG) {
    console.debug(`magick ${allArgs.join(" ")}`);
  }

  return spawnAsync("magick", allArgs);
};

const processScreenshot = async (
  { src, dest, tmp },
  { profileDir, phoneWidth, title, width, height, screenshot }
) => {
  const tmpDevice = `${tmp}/device.png`;
  const tmpBackground = `${tmp}/background.png`;
  const tmpScreenshot = `${tmp}/screenshot.png`;
  const tmpScreenshotComposite = `${tmp}/screenshot-composite.png`;

  const [_, rotate, label] = path
    .basename(src, ".png")
    .match(/^\d+\s*(rotLeft|rotRight)?[ -]*(.+)$/);

  // background
  await convert([
    "-size",
    `${width}x${height}`,
    `canvas:${backgroundColor}`,
    "-font",
    fontPath,
    "-weight",
    fontWeight,
    "-pointsize",
    fontSize,
    "-fill",
    fontColor,
    "-gravity",
    "North",
    "-annotate",
    `+0+${title.marginTop}`,
    label,
    tmpBackground
  ]);

  // phone image
  await convert([
    profileDir + "/device.png",
    "-resize",
    `${phoneWidth}x`,
    tmpDevice
  ]);

  // screenshot resize
  await convert([
    src,
    "-resize",
    screenshot.width,
    "-gravity",
    "North",
    tmpScreenshot
  ]);

  // phone with screenshot
  // compose dst-over with inversion of background & front because final size is the src size
  await composite(
    [
      !!rotate && "-rotate",
      !!rotate && "-30",
      "-compose",
      "dst-over",
      "-background",
      "transparent",
      "-gravity",
      "center",
      tmpScreenshot,
      tmpDevice,
      tmpScreenshotComposite
    ].filter(arg => arg)
  );

  if (rotate) {
    const geometryLeft =
      rotate == "rotLeft"
        ? `+${screenshot.rotation.marginLeft}`
        : screenshot.rotation.marginLeft - width;

    composite([
      "-gravity",
      "West",
      tmpScreenshotComposite,
      "-geometry",
      `${geometryLeft}+${screenshot.rotation.marginTop}`,
      tmpBackground,
      dest
    ]);
  } else {
    composite([
      "-gravity",
      "center",
      tmpScreenshotComposite,
      "-geometry",
      `+0+${screenshot.marginTop}`,
      tmpBackground,
      dest
    ]);
  }
};

const processProfile = dir => {
  const profileName = path.basename(dir);
  console.log("Profile " + profileName + " in " + dir);

  const profileDir = "./profiles/" + profileName;
  const config = require(profileDir + "/config.json");

  const destDir = `./screenshots/${profileName}`;
  rmkDir(destDir);

  return spawnAsync("find", [dir, "-name", "*.png", "-depth", "1"])
    .then(findResult)
    .then(imgs => {
      const transf = imgs.map((src, index) => {
        const dest = `${destDir}/${profileName} ${index + 1}.png`;
        const tmp = `./tmp/${profileName}-${index}`;
        rmkDir(tmp);

        return processScreenshot({ src, dest, tmp }, { profileDir, ...config })
          .then(() => {
            console.log("Wrote " + dest);
          })
          .catch(error => {
            console.error("Error during processing " + src, error);
          });
      });

      return Promise.all(transf);
    });
};

spawnAsync("find", ["sources", "-type", "d", "-depth", "1"])
  .then(findResult)
  .then(profiles => {
    profiles.forEach(profile => {
      processProfile(profile);
    });
  })
  .catch(error => {
    console.error(error);
  });
