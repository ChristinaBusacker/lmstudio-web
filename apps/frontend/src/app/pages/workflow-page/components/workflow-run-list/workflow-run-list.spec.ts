import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WorkflowRunList } from './workflow-run-list';

describe('WorkflowRunList', () => {
  let component: WorkflowRunList;
  let fixture: ComponentFixture<WorkflowRunList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkflowRunList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(WorkflowRunList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
