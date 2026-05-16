const authService = require("../services/authService");

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const authResult = await authService.login(username, password);
    if (!authResult) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.json(authResult);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login
};
