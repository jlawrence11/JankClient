import {Contextmenu} from "./contextmenu.js";
import {User} from "./user.js";
import {Member} from "./member.js";
import {MarkDown} from "./markdown.js";
import {Embed} from "./embed.js";
import { Channel } from "./channel.js";
import {Localuser} from "./localuser.js";
import { Role } from "./role.js";
import {File} from "./file.js";
import { SnowFlake } from "./snowflake.js";
import { messagejson } from "./jsontypes.js";

class Message{
    static contextmenu=new Contextmenu("message menu");
    owner:Channel;
    headers:Localuser["headers"];
    embeds:Embed[];
    author:User;
    mentions:User[];
    mention_roles:Role[];
    attachments:File[];//probably should be its own class tbh, should be Attachments[]
    snowflake:SnowFlake<Message>;
    message_reference;
    type:number;
    timestamp:number;
    content:MarkDown;
    static del:Promise<void>;
    static resolve:Function;
    div:HTMLDivElement;
    member:Member;
    get id(){
        return this.snowflake.id;
    }
    static setup(){
        this.del=new Promise(_=>{this.resolve=_});
        Message.setupcmenu();
    }
    static async wipeChanel(){
        this.resolve();
        document.getElementById("messages").innerHTML="";
        await Promise.allSettled([this.resolve]);
        this.del=new Promise(_=>{this.resolve=_})
    }
    static setupcmenu(){
        Message.contextmenu.addbutton("Copy raw text",function(){
            navigator.clipboard.writeText(this.content.rawString);
        });
        Message.contextmenu.addbutton("Reply",function(this:Message,div:HTMLDivElement){
            this.channel.setReplying(this);
        });
        Message.contextmenu.addbutton("Copy message id",function(){
            navigator.clipboard.writeText(this.id.id);
        });
        Message.contextmenu.addbutton("Edit",function(){
            this.channel.editing=this;
            const markdown=(document.getElementById("typebox"))["markdown"] as MarkDown;
            markdown.txt=this.content.rawString;
            markdown.boxupdate(document.getElementById("typebox"));
        },null,_=>{return _.author.id===_.localuser.user.id});
        Message.contextmenu.addbutton("Delete message",function(){
            this.delete();
        },null,_=>{return _.canDelete()})
    }
    constructor(messagejson:messagejson,owner:Channel){
        this.owner=owner;
        this.headers=this.owner.headers;
        this.giveData(messagejson);

    }
    giveData(messagejson:messagejson){
        for(const thing of Object.keys(messagejson)){
            if(thing==="attachments"){
                this.attachments=[];
                for(const thing of messagejson.attachments){
                    this.attachments.push(new File(thing,this));
                }
                continue;
            }else if(thing==="content"){
                this.content=new MarkDown(messagejson[thing],this.channel);
                continue;
            }else if(thing ==="id"){
                this.snowflake=new SnowFlake(messagejson.id,this);
                continue;
            }else if(thing==="member"){
                this.member=new Member(messagejson.member,this.guild);
                continue;
            }else if(thing ==="embeds"){
                this.embeds=[];
                for(const thing in messagejson.embeds){
                    console.log(thing,messagejson.embeds)
                    this.embeds[thing]=new Embed(messagejson.embeds[thing],this);
                }
                continue;
            }
            this[thing]=messagejson[thing];
        }


        this.author=new User(messagejson.author,this.localuser);
        for(const thing in messagejson.mentions){
            this.mentions[thing]=new User(messagejson.mentions[thing],this.localuser);
        }
        if(!this.member&&this.guild.id!=="@me"){
            this.author.resolvemember(this.guild).then(_=>{
                this.member=_;
            })
        }
        if(this.mentions.length||this.mention_roles.length){//currently mention_roles isn't implemented on the spacebar servers
            console.log(this.mentions,this.mention_roles)
        }
        if(this.mentionsuser(this.localuser.user)){
            console.log(this);
        }
        if(this.div){
            this.generateMessage();
        }
    }
    canDelete(){
        return this.channel.hasPermission("MANAGE_MESSAGES")||this.author.snowflake===this.localuser.user.snowflake;
    }
    get channel(){
        return this.owner;
    }
    get guild(){
        return this.owner.guild;
    }
    get localuser(){
        return this.owner.localuser;
    }
    get info(){
        return this.owner.info;
    }
    messageevents(obj:HTMLDivElement,del=Message.del){
        const func=Message.contextmenu.bind(obj,this);
        this.div=obj;
        del.then(_=>{
            obj.removeEventListener("click",func);
            this.div.remove();
            this.div=null;
        })
        obj.classList.add("messagediv");
    }
    mentionsuser(userd:User|Member){
        if(userd instanceof User){
            return this.mentions.includes(userd);
        }else if(userd instanceof Member){
            return this.mentions.includes(userd.user);
        }
    }
    getimages(){
        const build=[];
        for(const thing of this.attachments){
            if(thing.content_type.startsWith('image/')){
                build.push(thing);
            }
        }
        return build;
    }
    async edit(content){
        return await fetch(this.info.api.toString()+"/channels/"+this.channel.snowflake+"/messages/"+this.id,{
            method: "PATCH",
            headers: this.headers,
            body:JSON.stringify({content:content})
        });
    }
    delete(){
        fetch(`${this.info.api.toString()}/channels/${this.channel.snowflake}/messages/${this.id}`,{
            headers:this.headers,
            method:"DELETE",
        })
    }
    deleteEvent(){
        if(this.div){
            this.div.innerHTML="";
            this.div=null;
        }
        const prev=this.channel.idToPrev.get(this.snowflake);
        const next=this.channel.idToNext.get(this.snowflake);
        this.channel.idToNext.set(prev,next);
        this.channel.idToPrev.set(next,prev);
        this.channel.messageids.delete(this.snowflake);
        const regen=prev.getObject();
        if(regen){
            regen.generateMessage();
        }
        if(this.channel.lastmessage===this){
            this.channel.lastmessage=prev.getObject();
        }
    }
    generateMessage(premessage:Message=null){
        if(!premessage){
            premessage=this.channel.idToPrev.get(this.snowflake)?.getObject();
        }
        const div=this.div;
        if(this===this.channel.replyingto){
            div.classList.add("replying");
        }
        div.innerHTML="";
        const build = document.createElement('div');
        build.classList.add("flexltr");
        if(this.message_reference){
            const replyline=document.createElement("div");
            const line=document.createElement("hr");
            const minipfp=document.createElement("img")
            minipfp.classList.add("replypfp");
            replyline.appendChild(line);
            replyline.appendChild(minipfp);
            const username=document.createElement("span");
            replyline.appendChild(username);
            const reply=document.createElement("div");
            username.classList.add("username");
            this.author.bind(username,this.guild);

            /*
            Member.resolve(this.author,this.guild).then(_=>{
                if(!_) {return};
                console.log(_.error);
                if(_.error){
                    username.textContent+="Error";
                    alert("Should've gotten here")
                    const error=document.createElement("span");
                    error.textContent="!";
                    error.classList.add("membererror");
                    username.after(error);

                    return;
                }
                username.style.color=_.getColor();
            }).catch(_=>{
                console.log(_)
            });
            */

            reply.classList.add("replytext");
            replyline.appendChild(reply);
            const line2=document.createElement("hr");
            replyline.appendChild(line2);
            line2.classList.add("reply");
            line.classList.add("startreply");
            replyline.classList.add("replyflex")
            this.channel.getmessage(this.message_reference.message_id).then(message=>{
                const author=message.author;
                reply.appendChild(message.content.makeHTML({stdsize:true}));
                minipfp.src=author.getpfpsrc()
                author.bind(minipfp);
                username.textContent=author.username;
                author.bind(username);
            });
            div.appendChild(replyline);
        }
        build.classList.add("message");
        div.appendChild(build);
        if({0:true,19:true}[this.type]||this.attachments.length!==0){
            const pfpRow = document.createElement('div');
            pfpRow.classList.add("flexltr");
            let pfpparent, current
            if(premessage!=null){
                pfpparent??=premessage;
                let pfpparent2=pfpparent.all;
                pfpparent2??=pfpparent;
                const old=(new Date(pfpparent2.timestamp).getTime())/1000;
                const newt=(new Date(this.timestamp).getTime())/1000;
                current=(newt-old)>600;
            }
            const combine=(premessage?.author?.snowflake!=this.author.snowflake)||(current)||this.message_reference
            if(combine){
                const pfp=this.author.buildpfp();
                this.author.bind(pfp);
                pfpRow.appendChild(pfp);
            }else{
                div["pfpparent"]=pfpparent;
            }
            pfpRow.classList.add("pfprow")
            build.appendChild(pfpRow);
            const text=document.createElement("div");
            text.classList.add("flexttb")
            const texttxt=document.createElement("div");
            texttxt.classList.add("commentrow","flexttb");
            text.appendChild(texttxt);
            if(combine){
                const username=document.createElement("span");
                username.classList.add("username")
                this.author.bind(username,this.guild);
                div.classList.add("topMessage");
                username.textContent=this.author.username;
                const userwrap=document.createElement("div");
                userwrap.classList.add("flexltr");
                userwrap.appendChild(username)
                if(this.author.bot){
                    const username=document.createElement("span");
                    username.classList.add("bot")
                    username.textContent="BOT";
                    userwrap.appendChild(username)
                }
                const time=document.createElement("span");
                time.textContent="  "+formatTime(new Date(this.timestamp));
                time.classList.add("timestamp")
                userwrap.appendChild(time);

                texttxt.appendChild(userwrap)
            }else{
                div.classList.remove("topMessage");
            }
            const messaged=this.content.makeHTML();
            div["txt"]=messaged;
            const messagedwrap=document.createElement("div");
            messagedwrap.classList.add("flexttb")
            messagedwrap.appendChild(messaged)
            texttxt.appendChild(messagedwrap)

            build.appendChild(text)
            if(this.attachments.length){
                console.log(this.attachments)
                const attach = document.createElement("div");
                attach.classList.add("flexltr");
                for(const thing of this.attachments){
                    attach.appendChild(thing.getHTML())
                }
                messagedwrap.appendChild(attach)
            }
            if(this.embeds.length){
                console.log(this.embeds);
                const embeds = document.createElement("div")
                embeds.classList.add("flexltr");
                for(const thing of this.embeds){
                    embeds.appendChild(thing.generateHTML());
                }
                messagedwrap.appendChild(embeds)
            }
            //
        }else if(this.type===7){

            const text=document.createElement("div");
            text.classList.add("flexttb")
            const texttxt=document.createElement("div");
            text.appendChild(texttxt);
            build.appendChild(text);
            texttxt.classList.add("flexltr");
            const messaged=document.createElement("span");
            div["txt"]=messaged;
            messaged.textContent="welcome: ";
            texttxt.appendChild(messaged);

            const username=document.createElement("span");
            username.textContent=this.author.username;
            this.author.profileclick(username);
            this.author.bind(username,this.guild);
            texttxt.appendChild(username);
            username.classList.add("username");

            const time=document.createElement("span");
            time.textContent="  "+formatTime(new Date(this.timestamp));
            time.classList.add("timestamp");
            texttxt.append(time);
            div.classList.add("topMessage")

        }
        div["all"]=this;
        return(div)
    }
    buildhtml(premessage:Message,del:Promise<void>=Message.del){
        if(this.div){console.error(`HTML for ${this.snowflake} already exists, aborting`);return;}
        //premessage??=messages.lastChild;
        const div=document.createElement("div");
        this.div=div;

        this.messageevents(div,del);
        return this.generateMessage(premessage);
    }
}

function formatTime(date) {
    const now = new Date();
    const sameDay = date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.getDate() === yesterday.getDate() &&
        date.getMonth() === yesterday.getMonth() &&
        date.getFullYear() === yesterday.getFullYear();

    const formatTime = date => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (sameDay) {
        return `Today at ${formatTime(date)}`;
    } else if (isYesterday) {
        return `Yesterday at ${formatTime(date)}`;
    } else {
        return `${date.toLocaleDateString()} at ${formatTime(date)}`;
    }
}
Message.setup();
export { Message };
