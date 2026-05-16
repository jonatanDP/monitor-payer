const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");
const env = require("../config/env");

async function login(username, password) {
  const user = await userModel.findByUsername(username);
  if (!user) {
    return null;
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return null;
  }

  const token = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role
    },
    env.jwtSecret,
    { expiresIn: "12h" }
  );

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role
    }
  };
}

module.exports = {
  login
};
