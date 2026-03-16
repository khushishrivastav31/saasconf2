import RoleMembers from '../../modules/cfp/RoleMembers';

interface Props {
  conferenceId?: string;
  isAdmin: boolean;
}

export default function VolunteersTab({ conferenceId, isAdmin }: Props) {
  if (!conferenceId) return null;

  return <RoleMembers conferenceId={conferenceId} isAdmin={isAdmin} roleName="Volunteer" />;
}
