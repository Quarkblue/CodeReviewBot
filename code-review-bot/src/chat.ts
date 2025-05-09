import { OpenAI } from "openai";

class Chat {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  private getPrompt = (patch: string) => {
    const userPrompt = 'Review the following code changes'

    const formatReqPrompt = '\nProvide your feedback and suggestions for the following code changes in this format:\n' +
    '{\n' +
    '   "approved": boolean // true if the code looks good to merge and is upto standards, false if there are issues\n' +
    '   "comment": string // Your review comments on the code, it should be detailed and use markdown syntax if necassary in this string, overall response should be valid JSON\n' +
    '}\n' +
    'Make sure that your response is valid JSON object\n'

    return `${userPrompt}${formatReqPrompt}${patch}`
  }

  public codeReview = async (patch:string): Promise<{approved:boolean, comment: string}> => {
    if(!patch){
      return {
        approved: true,
        comment: ""
      };
    }

    const prompt = this.getPrompt(patch);

    const res = await this.openai.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'gpt-4o-mini',
      temperature: 0.5,
      top_p: 0.3,
      max_completion_tokens: 1500,
      response_format: {
        type: "json_object"
      },
    });

    if (res.choices.length){
      try {
        const json = JSON.parse(res.choices[0].message.content || "");
        return json;
      } catch (e) {
        return {
          approved: false,
          comment: res.choices[0].message.content || ""
        }
      }
    }
    return {
      approved: true,
      comment: ""
    }

  }

}


export default Chat