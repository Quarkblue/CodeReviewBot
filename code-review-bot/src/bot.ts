import { Probot } from "probot";
import * as pino from "pino";
import { minimatch } from "minimatch";
import Chat from "./chat.js";

const logger = pino.pino();

export const bot = (app: Probot) => {
  logger.info("bot init");

  const loadChatWithContext = async () => {
    if (process.env.OPENAI_API_KEY) {
      return new Chat(process.env.OPENAI_API_KEY);
    }
    return null;
  };

  app.on(
    [
      "pull_request.opened",
      "pull_request.synchronize",
      "pull_request.reopened",
    ],
    async (context) => {
      logger.info("pull request opened" + context.payload.pull_request.html_url);
      const repo = context.repo();
      const chat = await loadChatWithContext();

      if (!chat) {
        logger.error("Chat bot initialization failed");
        return "No Chat Bot";
      }

      const pr = context.payload.pull_request;

      logger.debug("pull_request: ", pr);

      if (pr.state === "closed" || pr.locked) {
        logger.debug("pull_request is closed or locked");
        return "invalid pull request payload";
      }

      const base = context.payload.pull_request.base.sha;
      const head = context.payload.pull_request.head.sha;

      const data = await context.octokit.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: base,
        head: head,
      });

      let { files: changedFiles, commits } = data.data;

      logger.debug("compareCommits, base: ", head, ", head: ", base);
      logger.debug("compared commits: ", commits);
      logger.debug("changed files: ", changedFiles);

      if (context.payload.action === "synchronize" && commits.length >= 2) {
        const {
          data: { files },
        } = await context.octokit.repos.compareCommits({
          owner: repo.owner,
          repo: repo.repo,
          base: commits[commits.length - 2].sha,
          head: commits[commits.length - 1].sha,
        });

        changedFiles = files;
      }

      const includePatterns = (process.env.INCLUDE_PATTERNS || "")
        .split(",")
        .filter((v) => Boolean(v.trim()));
      const ignorePatterns = (process.env.IGNORE_PATTERNS || "")
        .split(",")
        .filter((v) => Boolean(v.trim()));

      logger.debug("ignorePatterns: ", ignorePatterns);

      changedFiles = changedFiles?.filter((file) => {
        const url = new URL(file.contents_url);

        if (includePatterns.length) {
          return matchPatterns(includePatterns, url.pathname);
        }

        if (ignorePatterns.length) {
          return !matchPatterns(ignorePatterns, url.pathname);
        }

        return true;
      });

      if (!changedFiles?.length) {
        logger.debug("No files to review");
        return "no file changes";
      }

      const codeReviewResponses = [];

      logger.debug("changedFiles: ", changedFiles.length);

      for (let i = 0; i < changedFiles.length; i++) {
        const file = changedFiles[i];
        const patch = file.patch || "";
        if (file.status !== "modified" && file.status !== "added") {
          continue;
        }

        if (!patch || patch.length > 1500) {
          logger.debug(`${file.filename} : File too large to review`);
          continue;
        }
        try {
          // implement get code review from openai chat instance
          const response = await chat.codeReview(patch);
          if(!response.approved && !!response.comment){
            codeReviewResponses.push({
              path: file.filename,
              body: response.comment,
              position: patch.split("\n").length - 1,
            })
          }
          logger.debug("codeReviewResponses: ", codeReviewResponses);
        } catch (e) {
          logger.error(e);
        }
      }
      try {
        await context.octokit.pulls.createReview({
          repo: repo.repo,
          owner: repo.owner,
          pull_number: context.pullRequest().pull_number,
          body: codeReviewResponses.length ? "Review By Bot" : "No review, looks good to merge",
          event: "COMMENT",
          commit_id: commits[commits.length - 1].sha,
          comments: codeReviewResponses,
        });
      } catch (e) {
        logger.error(`Failed to create a review: ${e}`);
      }

      logger.info(
        "Successfully created a review ",
        context.payload.pull_request.html_url
      );

      return "success";
    }
  );
};

const matchPatterns = (patterns: string[], path: string) => {
  return patterns.some((pattern) => {
    try {
      return minimatch(
        path,
        pattern.startsWith("/")
          ? "**" + pattern
          : pattern.startsWith("**")
          ? pattern
          : "**/" + pattern
      );
    } catch {
      try {
        return new RegExp(pattern).test(path);
      } catch (e) {
        return false;
      }
    }
  });
};
