import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { Platform } from '@ionic/angular';
import { App } from '@capacitor/app';
import { MainLayoutComponent } from '../main-layout/main-layout.component';
import { Deployment } from '@mzima-client/sdk';
import { Subject, debounceTime } from 'rxjs';
import {
  AlertService,
  AuthService,
  ConfigService,
  DeploymentService,
  EnvService,
  SessionService,
} from '@services';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { ToastService } from '@services';

@UntilDestroy()
@Component({
  selector: 'app-choose-deployment',
  templateUrl: './choose-deployment.component.html',
  styleUrls: ['./choose-deployment.component.scss'],
})
export class ChooseDeploymentComponent {
  @Input() isProfile: boolean;
  @Output() back = new EventEmitter();
  @Output() chosen = new EventEmitter();
  @ViewChild('layout') public layout: MainLayoutComponent;
  public isSearchView = false;
  public showSearch = true;
  public deploymentList: Deployment[] = [];
  public foundDeploymentList: Deployment[] = [];
  private selectedDeployments: Deployment[] = [];
  public isDeploymentsLoading = false;
  public addButtonVisible = false;
  public currentDeploymentId?: number | string;
  private domain: string | null = null;
  private readonly searchSubject = new Subject<string>();

  tap = 0;

  constructor(
    private router: Router,
    private envService: EnvService,
    private configService: ConfigService,
    private deploymentService: DeploymentService,
    private alertService: AlertService,
    private authService: AuthService,
    private sessionService: SessionService,
    protected toastService: ToastService,
    protected platform: Platform,
  ) {
    this.showSearch = true;
    this.searchSubject.pipe(debounceTime(500)).subscribe({
      next: (query: string) => {
        console.log('Search Subject', query);
        this.deploymentService.searchDeployments(query).subscribe({
          next: (deployments: any[]) => {
            console.log(deployments);
            this.isDeploymentsLoading = false;
            this.foundDeploymentList = deployments;
          },
          error: (err: any) => {
            this.isDeploymentsLoading = false;
            console.log(err);
          },
        });
      },
    });

    this.deploymentService.deployment$.pipe(untilDestroyed(this)).subscribe({
      next: (deployment) => {
        this.currentDeploymentId = deployment?.id;
      },
    });

    if (!this.isProfile && this.platform.is('android')) {
      this.platform.backButton.subscribeWithPriority(65, () => {
        console.log('back button via hardware click from choose deployment view');

        this.tap++;
        console.log('Back Button Tap', this.tap);
        if (this.tap === 3) App.exitApp();
        else if (this.tap === 2) this.doubleTapExistToast();
      });
    }
  }

  public loadDeployments() {
    this.deploymentList = this.deploymentService.getDeployments();

    if (this.deploymentService.hasDuplicates(this.deploymentList)) {
      this.deploymentService.setDeployments(
        this.deploymentService.removeDuplicates(this.deploymentList),
      );
      this.deploymentList = this.deploymentService.getDeployments();
    }
  }

  public async callModal(event: any) {
    const result = await this.alertService.presentAlert({
      header: 'Are you sure you want to delete this deployment?',
      message: 'Deleting means that from now you will not see it in your deployment list.',
      buttons: [
        {
          text: 'Cancel',
          role: 'cancel',
        },
        {
          text: 'Delete',
          role: 'confirm',
          cssClass: 'danger',
        },
      ],
    });

    if (result.role === 'confirm') {
      const { deployment } = event;
      this.removeDeployment(deployment.id);
    }
  }

  public removeDeployment(deploymentId: number) {
    this.deploymentList = this.deploymentList.filter(
      (deployment) => deployment.id !== deploymentId,
    );
    this.deploymentService.setDeployments(this.deploymentList);
    if (this.deploymentList.length === 0) {
      this.currentDeploymentId = undefined;
      this.authService.logout();
      this.deploymentService.setDeployment(null);
      if (this.isProfile) this.router.navigate(['deployment']);
    } else if (this.currentDeploymentId === deploymentId) {
      this.currentDeploymentId = this.deploymentList[0].id;
      this.chooseDeployment(this.deploymentList[0]);
    }
  }

  public async chooseDeployment(deployment: Deployment) {
    const currentDeployment = this.deploymentService.getDeployment() ?? null;

    const isLoggedIn = this.sessionService.isLogged();
    if (isLoggedIn) {
      const result = await this.alertService.presentAlert({
        header: 'Log out of current deployment?',
        message:
          'Switching deployments will log out out of your current deployment, and you may need to log in again.',
        buttons: [
          {
            text: 'Cancel',
            role: 'cancel',
          },
          {
            text: 'Confirm',
            role: 'confirm',
            cssClass: 'danger',
          },
        ],
      });

      if (result.role !== 'confirm') {
        return;
      }
    }

    this.authService.logout();
    this.deploymentService.setDeployment(deployment);
    this.envService.setDynamicBackendUrl();
    try {
      await this.configService.initAllConfigurations();
      deployment.isOutdated = false;
      this.deploymentService.updateDeployment(deployment.id, { isOutdated: false });
      this.chosen.emit();
    } catch (error: any) {
      if (error.status === 404) {
        deployment.isOutdated = true;
        this.deploymentService.updateDeployment(deployment.id, { isOutdated: true });
        this.showDeploymentOutdatedWarning();
        this.deploymentService.setDeployment(currentDeployment);
        this.envService.setDynamicBackendUrl();
        await this.configService.initAllConfigurations();
      }
    }
  }

  private showDeploymentOutdatedWarning(): void {
    this.alertService.presentAlert({
      icon: {
        name: 'warning',
        color: 'danger',
      },
      header: 'Outdated Deployment!',
      message:
        "<p>We're sorry, but the deployment option you're trying to select is not supported by the application as the administrator hasn't updated it yet. Until the update is performed, the deployment won't function properly.</p><p>If you are the administrator of this deployment, please feel free to contact us for more information.</p>",
      buttons: [
        // {
        //   text: 'Contact us',
        //   cssClass: 'medium',
        //   handler: () => {
        //     this.intercomService.displayMessenger();
        //   },
        // },
        {
          text: 'Ok',
          cssClass: 'primary',
        },
      ],
    });
  }

  public selectDeployment(event: any) {
    const { checked, deployment } = event;
    if (checked) {
      if (this.selectedDeployments.some((i: any) => i.id === deployment.id)) {
        return;
      }
      this.selectedDeployments.push(deployment);
    } else {
      const index = this.selectedDeployments.findIndex((i: any) => i.id === deployment.id);
      if (index !== -1) {
        this.selectedDeployments.splice(index, 1);
      }
    }
    this.addButtonVisible = !!this.selectedDeployments.length;
  }

  public searchDeployments(query: string | null): void {
    console.log('Search Deployments', query);
    if (query == null) {
      this.isDeploymentsLoading = false;
      this.foundDeploymentList = [];
      this.domain = null;
    } else if (
      // query.indexOf('.') != -1 ||
      query.indexOf('http:') != -1 ||
      query.indexOf('https:') != -1
    ) {
      this.isDeploymentsLoading = false;
      this.foundDeploymentList = [];
      this.domain = query;
      // const value = this.deploymentService.removeDomainForSearch(this.domain);
      console.log('Domain for search', this.domain);
      this.searchSubject.next(this.domain);
    } else if (query.length > 0) {
      this.isDeploymentsLoading = true;
      this.domain = null;
      this.searchSubject.next(query);
    } else {
      this.isDeploymentsLoading = false;
      this.foundDeploymentList = [];
    }
  }

  public addDeployment(): void {
    console.log('Selected Deployments', this.selectedDeployments);
    this.deploymentService.addDeployments(this.selectedDeployments);
    this.layout.closeSearchForm();
    this.foundDeploymentList = [];
    this.addButtonVisible = false;
    this.loadDeployments();

    const deploymentCount = this.selectedDeployments.length;
    const header =
      deploymentCount > 1
        ? deploymentCount + ' Deployments Added Successfully!'
        : '1 Deployment Added Successfully!';
    const message =
      deploymentCount > 1
        ? 'You can now view these deployments and add posts to them'
        : 'You can now view this deployment and add posts to it';

    this.toastService.presentToast({
      header: header,
      message: message,
      buttons: [],
    });

    this.selectedDeployments = [];
  }

  public backHandle(): void {
    this.showSearch = false;
    this.back.emit();
  }

  protected async doubleTapExistToast() {
    const result = await this.toastService.presentToast({
      message: 'Tap back button again to exit the App',
      buttons: [],
    });
    if (result) {
      this.tap = 0;
    }
  }
}
