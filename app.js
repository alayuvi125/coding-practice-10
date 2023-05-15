const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "covid19IndiaPortal.db");
const app = express();

app.use(express.json());

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(-1);
  }
};
initializeDBAndServer();

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "coding_9", async (error, payload) => {
      if (error) {
        response.send("Invalid Access Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `SELECT * FROM user WHERE username = "${username}" ; `;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = jwt.sign(payload, "coding_9");

      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `select * from state;`;

  const statesList = await db.all(getStatesQuery);

  function getResponseObject(eachState) {
    return {
      stateId: eachState.state_id,
      stateName: eachState.state_name,
      population: eachState.population,
    };
  }

  response.send(statesList.map((eachState) => getResponseObject(eachState)));
});

app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId} ;`;
  const stateDetails = await db.get(getStateQuery);
  const result = {
    stateId: stateDetails.state_id,
    stateName: stateDetails.state_name,
    population: stateDetails.population,
  };
  response.send(result);
});

app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;
  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  const postDistrictDetailsQuery = `INSERT INTO district (district_name,state_id,cases,cured,active,deaths)
                    VALUES ("${districtName}",${stateId},${cases},${cured},${active},${deaths});`;
  await db.run(postDistrictDetailsQuery);

  response.send("District Successfully Added");
});

app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`;

    const districtResult = await db.get(getDistrictQuery);

    const result = {
      districtId: districtResult.district_id,
      districtName: districtResult.district_name,
      stateId: districtResult.state_id,
      cases: districtResult.cases,
      cured: districtResult.cured,
      active: districtResult.active,
      deaths: districtResult.deaths,
    };

    response.send(result);
  }
);

app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const deleteQuery = `DELETE FROM district WHERE district_id = ${districtId} ;`;

    await db.run(deleteQuery);
    response.send("District Removed");
  }
);

app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;
    const districtDetails = request.body;
    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;

    const updateDistQuery = `UPDATE district SET 
                        district_name = "${districtName}",
                        state_id = ${stateId},
                        cases = ${cases},
                        cured = ${cured},
                        active = ${active},
                        deaths = ${deaths}
                        WHERE district_id = ${districtId}; `;

    await db.run(updateDistQuery);
    response.send("District Details Updated");
  }
);

app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;

    const getStateQuery = `SELECT * FROM  state where state_id = ${stateId};`;

    const requiredState = await db.get(getStateQuery);

    const responseStateQuery = `SELECT SUM(cases) as totalCases,
                                        SUM(cured) as totalCured,
                                        SUM(active) as totalActive,
                                        SUM(deaths) as totalDeaths
                                FROM district
                                WHERE state_id = ${requiredState.state_id};`;

    const responseObject = await db.get(responseStateQuery);
    response.send(responseObject);
  }
);

module.exports = app;
