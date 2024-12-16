import { createZGServingNetworkBroker } from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";
import OpenAI from "openai";

const zgEvmRpc = process.env["ZEROG_EVM_RPC"];
const zgPrivateKey = process.env["ZEROG_PRIVATE_KEY"];

const provider = new ethers.JsonRpcProvider(zgEvmRpc);
const signer = new ethers.Wallet(zgPrivateKey, provider);


export async function getOpenaiService(){
    const broker = await createZGServingNetworkBroker(signer);

    const services = await broker.listService();

    const openAiServices = services.find(service => service.name?.includes("openai") );

    return openAiServices
}

export async function getOpenaiResult(content: string){
    const service = await getOpenaiService()

    if (!service){
        return null
    }

    const broker = await createZGServingNetworkBroker(signer);

    await broker.addAccount(service.provider, 2);

    const { endpoint, model } = await broker.getServiceMetadata(
      service.provider,
      service.name
    );

    const headers = await broker.getRequestHeaders(
      service.provider,
      service.name,
      content
    );

    const openai = new OpenAI({
      baseURL: endpoint,
      apiKey: " ",
    });
    const completion = await openai.chat.completions.create(
      {
        messages: [{ role: "system", content }],
        model: model,
      },
      {
        headers: {
          ...headers,
        },
      }
    );

    return completion
}
