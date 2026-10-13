import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { User } from '@supabase/supabase-js';
import type { AlbumEntry } from '../types';
import CloudPhotoTile from './CloudPhotoTile';
import {
  createCouple, currentCoupleId, disconnectCouple, downloadCloudPhoto,
  joinCouple, listAlbumMembers, listAllCloudPhotos, listCouples,
  makeCoupleInvitation, rotateCoupleInvite, uploadLocalPhoto,
  type CloudCouple, type CloudAlbumMember, type CloudPhoto,
} from '../lib/cloudAlbumV6';
import { finishApprovedRemoval, listRemovalRequests, requestRemoval, reviewRemoval, type RemovalRequest } from '../lib/sharedAlbumUX';
import { downloadBlob } from '../lib/storage';
import { createZip, type ZipFile } from '../lib/zipArchive';

type Props = {
  localCards: { entry: AlbumEntry; url: string }[];
  user: User | null;
  authLoading: boolean;
  onLogin: () => void;
  onSignOut: () => void;
};
const DAY = 86400000;

export default function CloudAlbumV64({ localCards, user, authLoading, onLogin, onSignOut }: Props) {
  const permanent = Boolean(user && !user.is_anonymous);
  const [couples,setCouples] = useState<CloudCouple[]>([]);
  const [activeId,setActiveId] = useState<string | null>(null);
  const [members,setMembers] = useState<CloudAlbumMember[]>([]);
  const [photos,setPhotos] = useState<CloudPhoto[]>([]);
  const [requests,setRequests] = useState<RemovalRequest[]>([]);
  const [loaded,setLoaded] = useState(false);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [revision,setRevision] = useState(0);
  const [connectOpen,setConnectOpen] = useState(false);
  const [connectMode,setConnectMode] = useState<'invite'|'join'>('invite');
  const [joinCode,setJoinCode] = useState('');
  const [inviteCode,setInviteCode] = useState('');
  const [infoOpen,setInfoOpen] = useState(false);
  const [menuOpen,setMenuOpen] = useState(false);
  const [disconnectOpen,setDisconnectOpen] = useState(false);
  const [pickerOpen,setPickerOpen] = useState(false);
  const [confirmShare,setConfirmShare] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const refresh = () => setRevision(r=>r+1);

  useEffect(() => {
    if (!permanent) {
      setCouples([]);setActiveId(null);setMembers([]);setPhotos([]);setRequests([]);
      setLoaded(false);currentRef.current=null;return;
    }
    let alive = true;
    const check = async () => {
      try {
        const [id,all] = await Promise.all([currentCoupleId(),listCouples()]);
        if (!alive) return;
        if (currentRef.current && currentRef.current !== id) setMessage('A little chapter has ended. Your shared photos are available to download for 7 days.');
        currentRef.current=id;
        setActiveId(id);setCouples(all);setLoaded(true);
      } catch (reason) {
        if (alive) {setLoaded(true);setError(reason instanceof Error?reason.message:'Could not open your album.');}
      }
    };
    void check();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void check();},12000);
    return ()=>{alive=false;window.clearInterval(timer);};
  },[permanent,user?.id,revision]);

  const active = couples.find(c=>c.id===activeId);
  const recentEnded = couples.find(c=>c.id!==activeId && c.archived_at &&
    Date.now()<new Date(c.archived_at).getTime()+7*DAY);
  const recoveryDays = recentEnded?.archived_at
    ? Math.max(1,Math.ceil((new Date(recentEnded.archived_at).getTime()+7*DAY-Date.now())/DAY)) : 0;
  useEffect(()=>{
    if(!permanent || !activeId){setMembers([]);setPhotos([]);setRequests([]);return;}
    let alive=true;
    const load=async()=>{
      try {
        const [people,pictures,pending]=await Promise.all([
          listAlbumMembers(activeId),listAllCloudPhotos('shared',activeId),listRemovalRequests(activeId),
        ]);
        if(alive){setMembers(people);setPhotos(pictures);setRequests(pending);}
      } catch(reason){if(alive)setError(reason instanceof Error?reason.message:'Could not refresh our memories.');}
    };
    void load();
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load();},12000);
    return ()=>{alive=false;window.clearInterval(timer);};
  },[permanent,activeId,revision]);
  useEffect(()=>{
    setInfoOpen(false);setMenuOpen(false);setDisconnectOpen(false);
    setPickerOpen(false);setConfirmShare(null);
  },[activeId]);

  const partner=members.find(m=>m.user_id!==user?.id);
  const connected=Boolean(active && !active.archived_at && !active.deleting_at && partner);
  const incoming=requests.filter(r=>r.status==='pending'&&r.requested_by!==user?.id && r.photo_id);
  const asked=new Set(requests.filter(r=>r.status==='pending'||r.status==='approved').map(r=>r.photo_id));

  async function run(action:string,task:()=>Promise<void>,success?:string){
    if(busy)return;
    setBusy(action);setError('');setMessage('');
    try{await task();if(success)setMessage(success);}
    catch(reason){setError(reason instanceof Error?reason.message:'Please try again.');}
    finally{setBusy('');}
  }
  const invite=()=>void run('invite',async()=>{
    const code=makeCoupleInvitation();await createCouple('our little album',code);
    setInviteCode(code);setConnectOpen(false);refresh();
  });
  const join=(event:FormEvent)=>{
    event.preventDefault();
    void run('join',async()=>{await joinCouple(joinCode);setJoinCode('');setInviteCode('');refresh();},'You are connected!');
  };
  const renew=()=>void run('renew',async()=>{
    if(!active)return;
    const code=makeCoupleInvitation();await rotateCoupleInvite(active.id,code);setInviteCode(code);
  });
  const copy=()=>void run('copy',async()=>{await navigator.clipboard.writeText(inviteCode);},'Invitation copied!');

  const share=()=>{
    if(!connected||!active||!user||!confirmShare)return;
    const photo=localCards.find(c=>c.entry.id===confirmShare);
    if(!photo)return;
    void run('share',async()=>{
      await uploadLocalPhoto(photo.entry,user,'shared',active.id);
      setConfirmShare(null);setPickerOpen(false);refresh();
    },'Shared with your person!');
  };
  const askRemove=(photo:CloudPhoto)=>void run('request-removal',async()=>{
    await requestRemoval(photo.id);refresh();
  },'Your person will see the request here when they visit.');
  const answer=(request:RemovalRequest,approve:boolean)=>void run('answer',async()=>{
    await reviewRemoval(request.id,approve);
    if(approve){
      try{await finishApprovedRemoval(request.id);}
      catch{setMessage('You both agreed. The photo will finish removing automatically.');}
    }
    refresh();
  },approve?'Both agreed to remove this photo.':'This memory stays!');

  async function downloadAll(id:string){
    const items=await listAllCloudPhotos('shared',id);
    if(!items.length)throw new Error('There are no photos here to download.');
    if(items.length>100)throw new Error('Please download photos individually when there are more than 100.');
    const files:ZipFile[]=[];
    let total=0;
    for(let i=0;i<items.length;i++){
      const blob=await downloadCloudPhoto(items[i]);total+=blob.size;
      if(total>150*1024*1024)throw new Error('Album is larger than 150 MB. Download photos individually.');
      files.push({name:`photos/photo-${String(i+1).padStart(3,'0')}.png`,data:blob,modifiedAt:new Date(items[i].created_at).getTime()});
    }
    downloadBlob(await createZip(files),`lovebug-memories-${new Date().toISOString().slice(0,10)}.zip`);
  }
  const disconnect=()=>{
    if(!active)return;
    void run('disconnect',async()=>{
      await disconnectCouple(active.id);
      setDisconnectOpen(false);setMenuOpen(false);setInviteCode('');refresh();
    },'Your connection has ended. You both have 7 days to download your memories.');
  };

  return <section className="cloud-album lovebug-v64-shared paper-card" aria-label="Our shared album">
    {authLoading?<p role="status">Opening your little album...</p>
      :!permanent?<div className="cloud-login">
        <h2>Our shared album &#9825;</h2>
        <p>Sign in with Google to make a little space for two.</p>
        <button type="button" className="pink-button" onClick={onLogin}>Continue with Google &#9825;</button>
      </div>:<>
      {!loaded?<p role="status">Finding your memories...</p>:!active?<>
        {recentEnded&&<div className="lovebug-v64-goodbye" role="status">
          <h3>A little chapter has ended &#9825;</h3>
          <p>Your shared album is closed. You have {recoveryDays} {recoveryDays===1?'day':'days'} left to download your photos.</p>
          <button type="button" className="soft-button" disabled={!!busy} onClick={()=>void run('download',()=>downloadAll(recentEnded.id),'Download started.')}>Download our photos</button>
        </div>}
        <div className="lovebug-v64-connect">
          <h2>Better together &#9825;</h2>
          <p>A little space for you and your favorite person.</p>
          {!connectOpen?<button type="button" className="pink-button" onClick={()=>setConnectOpen(true)}>Connect with someone &#9825;</button>
            :<>
              <div className="cloud-v6-connect-options" role="group" aria-label="Connect with someone">
                <button type="button" className={connectMode==='invite'?'active':''} aria-pressed={connectMode==='invite'} onClick={()=>setConnectMode('invite')}>Invite someone</button>
                <button type="button" className={connectMode==='join'?'active':''} aria-pressed={connectMode==='join'} onClick={()=>setConnectMode('join')}>I have a code</button>
              </div>
              {connectMode==='invite'?<button type="button" className="pink-button" disabled={!!busy} onClick={invite}>make our invitation &#9825;</button>
                :<form className="cloud-form" onSubmit={join}>
                  <label htmlFor="lovebug-v64-code">Their private invitation code</label>
                  <input id="lovebug-v64-code" minLength={64} maxLength={64} required autoComplete="off" spellCheck={false}
                    value={joinCode} onChange={e=>setJoinCode(e.target.value.trim().toLowerCase())} placeholder="Paste your code" />
                  <button type="submit" className="pink-button" disabled={!!busy}>Connect &#9825;</button>
                </form>}
              <button type="button" className="plain-button" onClick={()=>setConnectOpen(false)}>back</button>
            </>}
        </div>
        <button type="button" className="plain-button lovebug-v64-signout" onClick={onSignOut}>Sign out of Google</button>
      </>:<>
        <div className="lovebug-v64-heading">
          <h2>Our shared album &#9825;</h2>
          <div className="lovebug-v64-iconbar">
            <button type="button" aria-label="Who is in our album?" aria-expanded={infoOpen} onClick={()=>{setInfoOpen(v=>!v);setMenuOpen(false);}}>&#9432;</button>
            <button type="button" aria-label="Shared album options" aria-expanded={menuOpen} onClick={()=>{setMenuOpen(v=>!v);setInfoOpen(false);}}>&#8943;</button>
          </div>
        </div>
        {infoOpen&&<div className="lovebug-v64-popover" role="group" aria-label="Our little duo">
          <strong>Our little duo &#9825;</strong>
          {members.map(person=><p key={person.user_id}>{person.display_name}{person.user_id===user?.id?' (you)':''}</p>)}
        </div>}
        {menuOpen&&<div className="lovebug-v64-popover lovebug-v64-menu" role="group" aria-label="Shared album options">
          <button type="button" onClick={()=>{setDisconnectOpen(true);setMenuOpen(false);}}>Disconnect &#9825;</button>
          <button type="button" onClick={onSignOut}>Sign out of Google</button>
        </div>}
        {disconnectOpen&&<div className="lovebug-v64-dialog" role="group" aria-label="Disconnect from partner">
          <h3>A little goodbye? &#9825;</h3>
          <p>Our shared album will close for both of you. You can each download the photos for the next 7 days.</p>
          <button type="button" className="soft-button" disabled={!!busy} onClick={()=>void run('download',()=>downloadAll(active.id),'Download started.')}>Download our photos</button>
          <button type="button" className="lovebug-v64-warning" disabled={!!busy} onClick={disconnect}>Yes, disconnect</button>
          <button type="button" className="plain-button" onClick={()=>setDisconnectOpen(false)} disabled={!!busy}>Keep us connected</button>
        </div>}
        {!connected?<div className="lovebug-v64-waiting">
          <p>Waiting for your person &#9825;</p>
          {inviteCode?<div className="cloud-v6-invite" role="status">
            <strong>Your private invitation &#9825;</strong><p>Valid once for seven days. Send it privately.</p>
            <code>{inviteCode}</code><button type="button" className="soft-button" onClick={copy} disabled={!!busy}>Copy invitation</button>
          </div>:<button type="button" className="soft-button" onClick={renew} disabled={!!busy}>Make another invitation code</button>}
        </div>:<>
          <button type="button" className="soft-button lovebug-v64-add" onClick={()=>setPickerOpen(v=>!v)} disabled={!!busy} aria-expanded={pickerOpen}>+ Add a memory &#9825;</button>
          {pickerOpen&&<div className="lovebug-v64-picker" role="group" aria-label="Choose a memory to share">
            <p>Choose a photo saved on this device.</p>
            {localCards.length?<div className="lovebug-v64-pickgrid">{localCards.map(card=><button type="button" key={card.entry.id} disabled={!!busy} onClick={()=>setConfirmShare(card.entry.id)}>
              <img src={card.url} alt={'Photo saved on '+new Date(card.entry.createdAt).toLocaleDateString()} loading="lazy" />
            </button>)}</div>:<p>No photos saved here yet. Take a photo first &#9825;</p>}
            {confirmShare&&<div className="lovebug-v64-confirm-share"><p>Share this with your person?</p>
              <button type="button" className="soft-button" disabled={!!busy} onClick={share}>Share &#9825;</button>
              <button type="button" className="plain-button" onClick={()=>setConfirmShare(null)} disabled={!!busy}>Cancel</button>
            </div>}
          </div>}
          {incoming.length>0&&<div className="lovebug-v64-approval" role="group" aria-label="Photo removal approval">
            <h3>Keep this little memory? &#9825;</h3>
            <p>Your person wants to remove a photo.</p>
            {photos.find(p=>p.id===incoming[0].photo_id)&&<div className="lovebug-v64-approval-photo">
              <CloudPhotoTile photo={photos.find(p=>p.id===incoming[0].photo_id)!} />
            </div>}
            <div className="lovebug-v64-approval-actions">
              <button type="button" className="soft-button" disabled={!!busy} onClick={()=>answer(incoming[0],false)}>Keep it &#9825;</button>
              <button type="button" className="soft-button" disabled={!!busy} onClick={()=>answer(incoming[0],true)}>Remove &#9825;</button>
            </div>
          </div>}
          {photos.length?<div className="cloud-album-grid lovebug-v64-gallery">{photos.map(photo=><CloudPhotoTile key={photo.id} photo={photo}
            onDelete={asked.has(photo.id)?undefined:askRemove} deleteLabel="Ask to remove" busy={!!busy} />)}</div>
            :<p className="cloud-v6-empty">Our album is waiting for its first little memory &#9825;</p>}
        </>}
      </>}
      {message&&<p className="cloud-good-news" role="status">{message}</p>}
      {error&&<p className="error-note" role="alert">{error}</p>}
    </>}
  </section>;
}
