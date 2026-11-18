import { useNavigate } from "react-router-dom";
import { SPORT_LABEL } from "../../shared/sports";
import { RoomScene } from "./RoomScene";
import type { Member } from "./Building";

type Props = { member: Member; isMe: boolean; isOwner: boolean; penthouse?: boolean };

export function RoomTile({ member, isMe, isOwner, penthouse = false }: Props) {
  const nav = useNavigate();
  const lit = member.certifiedToday;
  const label = `${member.nickname}의 방, ${SPORT_LABEL[member.sport]}, ${lit ? "오늘 인증함" : "오늘 아직"}`;
  return (
    <button
      type="button"
      className={`room ${lit ? "on" : "off"}${isMe ? " me" : ""}`}
      aria-label={label}
      onClick={() => nav(`/room/${member.userId}`)}
    >
      <RoomScene sport={member.sport} lit={lit} avatar={member.avatar} penthouse={penthouse} placements={member.placements} />
      <span className="tag">
        <b>{member.nickname}</b>
        <span className="sport">{SPORT_LABEL[member.sport]}</span>
        <span className="badges">
          {member.floorUpToday && <em className="up-badge">+1층</em>}
          {isMe && <em className="me-badge">나</em>}
          {isOwner && <em className="owner-badge">방장</em>}
        </span>
      </span>
    </button>
  );
}
