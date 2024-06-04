const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");

const app = express();

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.json());

const openai = new OpenAI({
    apiKey: process.env.APIKEY, // Replace with your OpenAI API key
});

const threadByUser = {}; // Store thread IDs by user

app.post("/chat", async (req, res) => {
    const assistantIdToUse = process.env.ASSITANTKEY; // Replace with your assistant ID
    const modelToUse = "gpt-3.5-turbo"; // Specify the model you want to use
    const userId = req.body.userId; // You should include the user ID in the request

    // Create a new thread if it's the user's first message
    if (!threadByUser[userId]) {
        try {
            const myThread = await openai.beta.threads.create();
            console.log("New thread created with ID: ", myThread.id, "\n");
            threadByUser[userId] = myThread.id; // Store the thread ID for this user
        } catch (error) {
            console.error("Error creating thread:", error);
            res.status(500).json({ error: "Internal server error" });
            return;
        }
    }

    const userMessage = req.body.message;

    // Add a Message to the Thread
    try {
        const myThreadMessage = await openai.beta.threads.messages.create(
            threadByUser[userId], // Use the stored thread ID for this user
            {
                role: "user",
                content: userMessage,
            }
        );
        console.log("This is the message object: ", myThreadMessage, "\n");

        // Run the Assistant
        const myRun = await openai.beta.threads.runs.create(
            threadByUser[userId], // Use the stored thread ID for this user
            {
                assistant_id: assistantIdToUse,
                tools: [
                    { type: "code_interpreter" }, // Code interpreter tool
                    { type: "file_search" }, // Retrieval tool
                ],
            }
        );
        console.log("This is the run object: ", myRun, "\n");

        // Periodically retrieve the Run to check on its status
        const retrieveRun = async () => {
            let keepRetrievingRun;

            while (myRun.status !== "completed") {
                keepRetrievingRun = await openai.beta.threads.runs.retrieve(
                    threadByUser[userId], // Use the stored thread ID for this user
                    myRun.id
                );

                console.log(`Run status: ${keepRetrievingRun.status}`);

                if (keepRetrievingRun.status === "completed") {
                    console.log("\n");
                    break;
                }
            }
        };
        retrieveRun();

        // Retrieve the Messages added by the Assistant to the Thread
        const waitForAssistantMessage = async () => {
            await retrieveRun();

            const allMessages = await openai.beta.threads.messages.list(
                threadByUser[userId] // Use the stored thread ID for this user
            );

            // Send the response back to the front end
            res.status(200).json({
                response: allMessages.data[0].content[0].text.value,
            });
            console.log(
                "------------------------------------------------------------ \n"
            );

            console.log("User: ", myThreadMessage.content[0].text.value);
            console.log("Assistant: ", allMessages.data[0].content[0].text.value);
        };
        waitForAssistantMessage();
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});