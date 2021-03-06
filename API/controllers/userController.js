const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const userModel = require("../models/userModel");
const { generateAvatar } = require("../helpers/avatarCreate");

const createUser = async (req, res, next) => {
  try {
    const { password, email } = req.body;
    const passwordHash = await bcryptjs.hash(
      password,
      Number(process.env.COST_FACTOR)
    );
    const existingUser = await userModel.findUserByEmail(email);
    if (existingUser) {
      return res.status(409).send("User with such email already exists");
    }
    const avatarName = await generateAvatar();
    const avatarPath = `http://localhost:${process.env.PORT}/images/${avatarName}`;
    const addedNewUser = await userModel.create({
      email,
      password: passwordHash,
      avatarURL: avatarPath,
    });

    return res.status(201).json({
      email: addedNewUser.email,
      subscription: addedNewUser.subscription,
    });
  } catch (err) {
    next(err);
  }
};

const logIn = async (req, res, next) => {
  try {
    const { password, email } = req.body;
    const existingUser = await userModel.findUserByEmail(email);
    if (!existingUser) {
      return res.status(401).send("Email or password is wrong");
    }
    const isPasswordValid = await bcryptjs.compare(
      password,
      existingUser.password
    );
    if (!isPasswordValid) {
      return res.status(401).send("Authentication failed");
    }
    const token = jwt.sign({ id: existingUser._id }, process.env.JWT_SECRET, {
      expiresIn: 2 * 24 * 60 * 60,
    });
    await userModel.updateToken(existingUser._id, token);
    return res.status(200).send({
      token: token,
      user: {
        email: existingUser.email,
        subscription: existingUser.subscription,
      },
    });
  } catch (err) {
    next(err);
  }
};

const authorize = async (req, res, next) => {
  try {
    // 1. витягнути токен користувача з заголовка Authorization
    const authorizationHeader = req.get("Authorization") || "";
    const token = authorizationHeader.replace("Bearer ", "");
    // 2. витягнути id користувача з пейлоада або вернути користувачу
    // помилку зі статус кодом 401
    let userId;
    try {
      userId = await jwt.verify(token, process.env.JWT_SECRET).id;
    } catch (err) {
      next(err);
    }
    // 3. витягнути відповідного користувача. Якщо такого немає - викинути
    // помилку зі статус кодом 401
    // userModel - модель користувача в нашій системі
    const user = await userModel.findById(userId);

    if (!user || user.token !== token) {
      return res.status(401).send("Email or password is wrong");
    }

    // 4. Якщо все пройшло успішно - передати запис користувача і токен в req
    // і передати обробку запиту на наступний middleware
    req.user = user;
    req.token = token;

    next();
  } catch (err) {
    next(err);
  }
};

const logOut = async (req, res, next) => {
  try {
    const user = req.user;
    await userModel.updateToken(user._id, null);
    return res.status(204).send();
  } catch (error) {
    next(error);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    const user = req.user;
    return res.status(200).send({
      id: user._id,
      email: user.email,
      subscription: user.subscription,
    });
  } catch (error) {
    next(error);
  }
};

const updateSubscription = async (req, res, next) => {
  try {
    const user = req.user;
    const availableSubs = ["free", "pro", "premium"];
    if (availableSubs.includes(req.body.subscription)) {
      const updatedSubscription = await userModel.findByIdAndUpdate(
        user._id,
        { subscription: req.body.subscription },
        {
          new: true,
        }
      );
      res.status(200).send(updatedSubscription);
    } else {
      res.status(400).send({
        message: "Please choose from the list of available subscriptions",
      });
    }
  } catch (error) {
    next(error);
  }
};

const updateUserInfo = async (req, res, next) => {
  const { user } = req;
  const { file } = req;

  const newImagePath = `http://localhost:3000/images/${file.filename}`;

  const updatedImage = await userModel.findByIdAndUpdate(
    user._id,
    {
      avatarURL: newImagePath,
    },
    { new: true }
  );

  res.status(200).send({
    avatarURL: updatedImage.avatarURL,
  });
};

module.exports = {
  createUser,
  logIn,
  logOut,
  authorize,
  getCurrentUser,
  updateSubscription,
  updateUserInfo,
};
